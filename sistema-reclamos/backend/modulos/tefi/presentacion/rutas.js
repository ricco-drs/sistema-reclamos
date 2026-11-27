import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { limiteSubidas, marcarLimite, MAX_PDF_BYTES, soloPdf } from '@tefiis/compartido';
import { PROMPT_TEFI } from '../infraestructura/promptTefi.js';

export function crearModuloTefi({
  sbRest, sbRestTodo, logActividad, requireAdminAuth, requireStudentAuth, emailDeSesionOpcional,
  SUPER_ADMIN_EMAIL, obtenerNombreStoreRag, modoAlmuerzoActivo, modoAlmuerzoFestivoActivo,
  storeIdFile, uploadDir,
}) {
  const rutas = Router();

  // /api/rag/ask no pide sesión y cada llamada gasta cuota de Gemini (dinero).
  const limiteIa = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiadas consultas seguidas. Espera un momento.' },
  });

  // Guarda un turno de conversación. No se espera el resultado ni se propaga el
  // error: si falla el guardado, el estudiante debe recibir su respuesta igual.
  // La auditoría no puede ser motivo para que el chat deje de funcionar.
  const MAX_TEXTO_CONVERSACION = 20_000;
  function guardarTurnoConversacion({ email, conversacionId, pregunta, respuesta }) {
    if (!email) return;                       // sin sesión no hay a quién atribuirlo
    sbRest('/conversaciones', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        email: email.toLowerCase(),
        conversacion_id: String(conversacionId || 'sin-id').slice(0, 64),
        pregunta: String(pregunta || '').slice(0, MAX_TEXTO_CONVERSACION),
        respuesta: String(respuesta || '').slice(0, MAX_TEXTO_CONVERSACION),
      }),
    }).catch(err => console.error('No se pudo guardar la conversación:', err.message));
  }

  // Inicializar el nuevo SDK de Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.VITE_API_KEY });

  // Configurar multer para recibir archivos temporales desde React
  if (!fs.existsSync(uploadDir)){
      fs.mkdirSync(uploadDir);
  }
  const storage = multer.diskStorage({
      destination: function (req, file, cb) {
          cb(null, uploadDir)
      },
      filename: function (req, file, cb) {
          // Limpiamos el nombre original por seguridad y añadimos un timestamp
          const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
          cb(null, Date.now() + '-' + cleanName);
      }
  });
  const upload = multer({
    storage: storage,
    limits: { fileSize: MAX_PDF_BYTES, files: 1 },
    fileFilter: soloPdf,
  });

  // ── Store del RAG ───────────────────────────────────────────────────────────
  // El id vive en app_settings, no en un archivo del repo. Antes estaba en
  // backend/.rag_store_id, y como seed_rag.js crea un store nuevo en cada
  // reindexado, actualizar un reglamento obligaba a commitear ese archivo y
  // redesplegar el backend. Leyéndolo de la base, el script actualiza el valor y
  // este proceso lo recoge solo.
  const RAG_STORE_TTL_MS = 5 * 60 * 1000;

  let currentStoreName = null;
  let ragStoreLeidoEn = 0;

  // Respaldo: archivo heredado, por si la base todavía no tiene la clave.
  if (fs.existsSync(storeIdFile)) {
      currentStoreName = fs.readFileSync(storeIdFile, 'utf8').trim();
  }

  async function obtenerStoreRag({ forzar = false } = {}) {
      const vencido = Date.now() - ragStoreLeidoEn > RAG_STORE_TTL_MS;
      if (!forzar && !vencido && currentStoreName) return currentStoreName;
      try {
          const valor = await obtenerNombreStoreRag();
          if (typeof valor === 'string' && valor.trim()) {
              if (valor !== currentStoreName) {
                  console.log(`Cerebro RAG actualizado a: ${valor}`);
              }
              currentStoreName = valor.trim();
          }
      } catch (err) {
          // Si la base no responde se sigue con el último valor conocido: es
          // preferible responder con el store anterior que dejar a Tefi mudo.
          console.error('No se pudo leer el store del RAG desde app_settings:', err.message);
      }
      ragStoreLeidoEn = Date.now();
      return currentStoreName;
  }

  obtenerStoreRag({ forzar: true }).then(nombre => {
      console.log(nombre
          ? `Backend conectado al Cerebro RAG oficial: ${nombre}`
          : 'Sin store de RAG configurado — corre "npm run seed-rag".');
  });

  // ==========================================
  // 1. ENDPOINT: SUBIR E INDEXAR (FILE SEARCH)
  // ==========================================
  rutas.post('/api/rag/upload', requireAdminAuth, limiteSubidas, marcarLimite(MAX_PDF_BYTES), upload.single('file'), async (req, res) => {
      try {
          if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
              return res.status(403).json({ error: 'Solo el administrador principal puede indexar documentos.' });
          }
          if (!req.file) {
              return res.status(400).json({ error: 'No se envió ningún archivo' });
          }

          console.log(`Recibiendo archivo: ${req.file.originalname}`);

          // 1. Crear el File Search Store si no existe
          if (!currentStoreName) {
              console.log("Creando nuevo File Search Store en Google...");
              const fileSearchStore = await ai.fileSearchStores.create({
                  config: { displayName: 'tefiis-store' }
              });
              currentStoreName = fileSearchStore.name;
          }

          // 2. Subir el archivo a los servidores de Google
          console.log("Subiendo archivo temporal a Gemini...");
          const uploadedFile = await ai.files.upload({
              file: req.file.path,
              config: { mimeType: 'application/pdf' } // Asumimos PDF por ahora
          });

          // 3. Importar el archivo a nuestro Store (Aquí es donde ocurre la magia del RAG)
          console.log("Indexando el archivo para el RAG...");
          await ai.fileSearchStores.importFile({
              fileSearchStoreName: currentStoreName,
              fileName: uploadedFile.name
          });

          console.log('Archivo indexado con éxito.');

          // 4. Borrar el archivo local de nuestra carpeta 'uploads' para no ocupar espacio
          fs.unlinkSync(req.file.path);

          logActividad({ actorEmail: req.adminEmail, actorType: 'admin', accion: 'rag_documento_indexado', detalle: { archivo: req.file.originalname } });

          res.json({
              success: true,
              message: 'Archivo indexado correctamente y listo para preguntas.',
              storeName: currentStoreName
          });

      } catch (error) {
          console.error("Error al indexar:", error);
          res.status(500).json({ error: error.message });
      }
  });

  // ==========================================
  // 2. ENDPOINT: PREGUNTAR AL DOCUMENTO (RAG)
  // ==========================================
  rutas.post('/api/rag/ask', limiteIa, async (req, res) => {
      try {
          const { question, history = [], conversacionId } = req.body;

          if (!question) {
              return res.status(400).json({ error: 'La pregunta es obligatoria' });
          }
          // Sin esto el modo almuerzo no pausa nada: quien ya tuviera el chat
          // abierto seguiría preguntando y Tefi seguiría gastando cuota, que es
          // justo lo que se quiere parar. 503 y no 403: es una pausa, no un veto.
          if (await modoAlmuerzoFestivoActivo()) {
              return res.status(503).json({
                  motivo: 'almuerzo_festivo',
                  error: 'Tefi está almorzando con Santa Rosa de Lima y no puede responder consultas por ahora. Mientras tanto sí puedes registrar tu reclamo.',
              });
          }
          if (await modoAlmuerzoActivo()) {
              // motivo va aparte para que el cliente lo distinga por un campo y
              // no por cómo esté redactado el texto, que puede cambiar.
              return res.status(503).json({
                  motivo: 'almuerzo',
                  error: 'Tefi está almorzando y no puede responder consultas por ahora. Mientras tanto sí puedes registrar tu reclamo.',
              });
          }
          const emailEstudiante = emailDeSesionOpcional(req);
          await obtenerStoreRag();
          if (!currentStoreName) {
              return res.status(400).json({ error: 'Todavía no hay documentos indexados para consultar.' });
          }

          console.log(`Pregunta recibida: "${question}"`);

          // El historial sigue viniendo del cliente —la conversación vive en su
          // navegador— pero se acota: sin límite, una sola petición puede inflar
          // el gasto de tokens tanto como se quiera.
          const MAX_TURNOS_HISTORIAL = 20;
          const MAX_CHARS_MENSAJE = 4000;
          let contents = [];
          for (const msg of history.slice(-MAX_TURNOS_HISTORIAL)) {
              const rol = msg?.role === 'model' ? 'model' : 'user';
              const texto = String(msg?.text || '').slice(0, MAX_CHARS_MENSAJE);
              if (texto) contents.push({ role: rol, parts: [{ text: texto }] });
          }
          contents.push({ role: 'user', parts: [{ text: String(question).slice(0, MAX_CHARS_MENSAJE) }] });

          const config = {
              tools: [{ fileSearch: { fileSearchStoreNames: [currentStoreName] } }],
              systemInstruction: PROMPT_TEFI,
          };

          let response;
          try {
              response = await ai.models.generateContent({
                  model: "gemini-2.5-flash",
                  contents: contents,
                  config: config
              });
          } catch (modelError) {
              console.log("Error con gemini-2.5-flash, intentando con gemini-1.5-flash...", modelError.message);
              const fallbackConfig = {
                  tools: [{ fileSearch: { fileSearchStoreNames: [currentStoreName] } }],
                  systemInstruction: PROMPT_TEFI,
              };
              response = await ai.models.generateContent({
                  model: "gemini-1.5-flash",
                  contents: contents,
                  config: fallbackConfig
              });
          }

          // Extraer solo el texto final, ignorando partes de "thought"
          const parts = response.candidates?.[0]?.content?.parts ?? [];
          const textParts = parts.filter(p => p.text && !p.thought);
          let answer = (textParts.length > 0 ? textParts[textParts.length - 1].text : response.text ?? '').trim();

          guardarTurnoConversacion({
              email: emailEstudiante,
              conversacionId,
              pregunta: question,
              respuesta: answer,
          });

          res.json({
              success: true,
              answer: answer
          });

      } catch (error) {
          console.error("Error al responder:", error);
          res.status(500).json({ error: error.message });
      }
  });

  // ==========================================
  // AUDITORÍA DE CONVERSACIONES — solo admin principal
  // ==========================================
  // Leer lo que los estudiantes le cuentan a Tefi es más sensible que el resto del
  // panel: ahí aparecen situaciones personales. Se restringe igual que el
  // historial de actividad, al administrador principal.
  // Abierto a cualquier admin, no solo al principal: todo el equipo necesita ver
  // de qué hablan los estudiantes con Tefi para poder ayudarlos.
  rutas.get('/api/admin/conversaciones', requireAdminAuth, async (req, res) => {
    try {
      // Se traen solo las columnas necesarias para el listado, no los textos: son
      // largos y aquí solo hace falta saber quién habló, cuánto y cuándo.
      const traido = await sbRestTodo('/conversaciones?select=email,conversacion_id,created_at&order=created_at.desc');
      if (!traido.ok) { const t = await traido.respuesta.text(); return res.status(500).json({ error: t }); }
      const filas = traido.filas;

      const porEmail = new Map();
      for (const f of filas) {
        if (!porEmail.has(f.email)) {
          porEmail.set(f.email, { email: f.email, turnos: 0, conversaciones: new Set(), ultimo: f.created_at, primero: f.created_at });
        }
        const e = porEmail.get(f.email);
        e.turnos++;
        e.conversaciones.add(f.conversacion_id);
        // Vienen ordenadas de más nueva a más vieja, así que la última que se ve
        // es la más antigua.
        e.primero = f.created_at;
      }
      res.json([...porEmail.values()].map(e => ({
        email: e.email,
        turnos: e.turnos,
        conversaciones: e.conversaciones.size,
        ultimo: e.ultimo,
        primero: e.primero,
      })));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  rutas.get('/api/admin/conversaciones/:email', requireAdminAuth, async (req, res) => {
    const email = String(req.params.email || '').toLowerCase();
    try {
      const r = await sbRest(`/conversaciones?select=*&email=eq.${encodeURIComponent(email)}&order=created_at.asc&limit=2000`);
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      const filas = await r.json();

      // Se agrupan por conversación para que se lean como hilos y no como una
      // lista suelta de preguntas sin contexto.
      const hilos = [];
      for (const f of filas) {
        let hilo = hilos.find(h => h.conversacionId === f.conversacion_id);
        if (!hilo) {
          hilo = { conversacionId: f.conversacion_id, inicio: f.created_at, turnos: [] };
          hilos.push(hilo);
        }
        hilo.fin = f.created_at;
        hilo.turnos.push({ pregunta: f.pregunta, respuesta: f.respuesta, fecha: f.created_at });
      }
      hilos.sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
      logActividad({ actorEmail: req.adminEmail, actorType: 'admin', accion: 'conversacion_auditada', detalle: { estudiante: email } });
      res.json({ email, hilos });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // CHAT: GUARDAR HISTORIAL
  // ==========================================
  rutas.post('/api/chat/save', requireStudentAuth, async (req, res) => {
    const email = req.studentEmail;
    const { pregunta, respuesta } = req.body;
    if (!pregunta || !respuesta) {
      return res.status(400).json({ error: 'Faltan campos' });
    }
    try {
      const r = await sbRest('/chat_historial', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify([
          { email, role: 'user',      content: pregunta  },
          { email, role: 'assistant', content: respuesta }
        ])
      });
      if (!r.ok) {
        const txt = await r.text();
        console.error('Supabase error:', txt);
        return res.status(500).json({ error: txt });
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Error guardando historial:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return { rutas };
}
