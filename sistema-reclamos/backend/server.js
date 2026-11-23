// Módulos del backend (Lab09, docs/particiones.md). Cada uno es un workspace de npm y
// se entra solo por su paquete: server.js es el único lugar que los conecta.
import { crearModuloAcceso, SUPER_ADMIN_EMAIL } from '@tefiis/acceso';
import { crearModuloConfiguracion } from '@tefiis/configuracion';
import {
  crearModuloDocumentos, esDocumentoPropio, esEvidenciaPropia, almacenamientoDeEvidencias,
} from '@tefiis/documentos';
import { crearModuloTefi } from '@tefiis/tefi';
import { crearModuloReclamos, RECLAMO_REGISTRADO } from '@tefiis/reclamos';
import {
  crearConsumidoresDeReclamoRegistrado, crearClienteM2Http, crearClienteM2Memoria, componerConfirmacion,
} from '@tefiis/notificaciones';
import {
  crearBusEnProceso, crearEnviadorCorreo, respuestaDeCuerpoInvalido, MAX_PDF_BYTES,
  sbRest, sbRestTodo, logActividad,
} from '@tefiis/compartido';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
// Mismo catálogo de cursos que ve el estudiante. El servidor valida contra él
// porque el cuerpo de la petición lo controla el navegador: sin esto, un
// cliente manipulado puede meter un curso o una sección que no existen y el
// Tercio recibe un reclamo imposible de tramitar.
import CURSOS_SECCIONES from '../src/data/cursos_secciones.json' with { type: 'json' };
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 3005;

// ── CORS ────────────────────────────────────────────────────────────────────
// ALLOWED_ORIGINS = lista separada por comas con los orígenes del front
// (app de estudiantes y panel admin). Si no está definida se acepta cualquier
// origen, que es el comportamiento anterior: se avisa por consola en vez de
// romper producción, pero conviene definirla.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);

if (ALLOWED_ORIGINS.length === 0) {
  console.warn('ALLOWED_ORIGINS no está definida — se acepta cualquier origen. Defínela con las URLs del front.');
  app.use(cors());
} else {
  console.log('CORS restringido a:', ALLOWED_ORIGINS.join(', '));
  app.use(cors({
    origin: (origin, cb) => {
      // Sin origin son peticiones que no vienen de un navegador (curl, health
      // checks de Railway): no hay nada que proteger con CORS ahí.
      if (!origin) return cb(null, true);
      // Se devuelve la cadena exacta para que cors emita ese origen y Vary.
      // Ojo: cb(null, false) NO sirve para bloquear — el paquete lo interpreta
      // como "CORS desactivado" y responde Access-Control-Allow-Origin: *.
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, origin);
      return cb(new Error('Origen no permitido por CORS.'));
    },
  }));
}

// Los cuerpos JSON de esta API son pequeños (los PDF van por multipart). Un
// límite explícito evita que alguien mande megas de JSON para agotar memoria.
app.use(express.json({ limit: '1mb' }));

// Railway va detrás de proxy: sin esto req.ip es la IP del proxy y los
// limitadores por IP agruparían a todos los usuarios en una sola cubeta.
app.set('trust proxy', 1);

// ── Envío de correo: Brevo, luego Resend y luego Mailjet, todos por HTTP (sin SMTP, funciona en Railway) ──
// El enviador de compartido (correo/enviadorCorreo.js, #34) mantiene ese orden de
// respaldo y agrega un tiempo límite por proveedor: si uno se cuelga, se pasa al
// siguiente en vez de esperar para siempre (escenario E5).
const sendEmail = crearEnviadorCorreo({ timeoutMs: tiempoLimiteCorreoMs() });

// EMAIL_TIMEOUT_MS en milisegundos; 0 desactiva el límite. Un valor que no es
// número desactivaría el límite sin avisar, así que se avisa y se usan 3 s.
function tiempoLimiteCorreoMs() {
  const crudo = process.env.EMAIL_TIMEOUT_MS;
  if (crudo === undefined || crudo.trim() === '') return 3000;
  const ms = Number(crudo);
  if (Number.isFinite(ms) && ms >= 0) return ms;
  console.warn(`EMAIL_TIMEOUT_MS="${crudo}" no es un número válido; se usan 3000 ms.`);
  return 3000;
}

const acceso = crearModuloAcceso({ sendEmail, logActividad });
const { requireStudentAuth, requireAdminAuth, emailDeSesionOpcional, limiteEnvioCodigo } = acceso;
const configuracion = crearModuloConfiguracion({
  sbRest, logActividad, requireAdminAuth, emailDeSesionOpcional, SUPER_ADMIN_EMAIL,
});
const {
  tefiDurmiendoActivo, despedidaActivaPara, puedeEnviarReclamo, obtenerNombreStoreRag,
  modoAlmuerzoActivo, modoAlmuerzoFestivoActivo,
} = configuracion;
const documentos = crearModuloDocumentos({
  sbRest, logActividad, despedidaActivaPara, requireAdminAuth, requireStudentAuth,
});
const tefi = crearModuloTefi({
  sbRest, sbRestTodo, logActividad, requireAdminAuth, requireStudentAuth, emailDeSesionOpcional,
  SUPER_ADMIN_EMAIL, obtenerNombreStoreRag, modoAlmuerzoActivo, modoAlmuerzoFestivoActivo,
  storeIdFile: path.join(__dirname, '.rag_store_id'),
  uploadDir: path.join(__dirname, '../uploads'),
});

const CATALOGO_CURSOS = new Map(CURSOS_SECCIONES.map((c) => [c.codigo, c]));

// ── Módulos reclamos y notificaciones, y el evento ReclamoRegistrado ──
// (Lab09 y Lab10; docs/particiones.md y docs/api/eventos.md)
// Las reglas del registro (ventana, pruebas propias, cursos del catálogo, duplicados
// y numeración) viven en el módulo reclamos, que también registra sus rutas. Cuando el
// reclamo queda guardado publica ReclamoRegistrado en el bus, y los dos consumidores del
// módulo notificaciones envían el correo de confirmación y el expediente a M2. El bus no
// los espera: si uno falla, el estudiante igual recibe su número y el error queda en el
// registro del servidor. Ningún módulo importa a otro: lo que uno necesita del otro se
// lo pasa este archivo.
const bus = crearBusEnProceso({
  alFallar: (evento, consumidor, err) =>
    console.error(`[EVENTOS] ${consumidor} falló en ${evento.eventoId}:`, err?.message ?? err),
});

const reclamos = crearModuloReclamos({
  sbRest, sbRestTodo, sendEmail, componerConfirmacion, limiteEnvioCodigo, almacenamientoDeEvidencias,
  publicador: bus,
  // Los interruptores (configuración) deciden si hoy se reciben reclamos; reclamos
  // los recibe como el puerto PoliticaDeRecepcion.
  interruptores: { tefiDurmiendoActivo, despedidaActivaPara, puedeEnviarReclamo },
  catalogoCursos: CATALOGO_CURSOS,
  esEvidenciaPropia,
  esDocumentoPropio,
  logActividad,
  registrarError: (mensaje, err) => console.error(mensaje, err?.message ?? ''),
  exigirEstudiante: requireStudentAuth,
  exigirAdmin: requireAdminAuth,
});

// M2 recibe el expediente de cada reclamo, igual que cuando lo enviaba el front.
// Sin M2_URL (desarrollo y Compose) el expediente queda en memoria y no se llama al
// M2 real, para que las pruebas no le manden expedientes falsos. En Railway tiene
// que estar definida, o los expedientes dejan de llegar a M2.
if (!process.env.M2_URL) {
  console.warn('M2_URL no está definida: los expedientes se guardan en memoria y no llegan a M2.');
}
// M2 está en Render, que lo duerme cuando no tiene tráfico, y despertarlo tarda más
// de 25 s. El cliente corta a los 10 s por defecto y no reintenta, así que se
// perdería el expediente del primer reclamo después de cada pausa. Como el bus no
// hace esperar al estudiante, darle 60 s no demora su respuesta.
const ESPERA_M2_MS = 60_000;
const clienteM2 = process.env.M2_URL
  ? crearClienteM2Http({ url: process.env.M2_URL, timeoutMs: ESPERA_M2_MS })
  : crearClienteM2Memoria();

// Los consumidores viven en notificaciones, un módulo distinto del que publica (Lab10,
// paso 6). El nombre del evento se lo da este archivo, y el de M2 lee la descripción por
// la fuente que le deja reclamos, porque el evento no la lleva.
const consumidores = crearConsumidoresDeReclamoRegistrado({
  enviarCorreo: sendEmail,
  fuenteDeExpedientes: reclamos.fuenteDeExpedientes,
  m2: clienteM2,
});
bus.suscribir(RECLAMO_REGISTRADO, consumidores.correo, 'correo');
bus.suscribir(RECLAMO_REGISTRADO, consumidores.m2, 'm2');

app.use(acceso.rutas, reclamos.rutas, documentos.rutas, tefi.rutas, configuracion.rutas);

// Manejador final de errores. Sin esto, un PDF que pasa del límite o un archivo
// que no es PDF revientan con un 500 y un stack en el log, en vez de decirle al
// alumno qué pasó. También evita filtrar detalles internos en la respuesta.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const cuerpoInvalido = respuestaDeCuerpoInvalido(err);
  if (cuerpoInvalido) return res.status(cuerpoInvalido.status).json(cuerpoInvalido.body);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    const tope = (req.limiteBytes || MAX_PDF_BYTES) / (1024 * 1024);
    return res.status(413).json({ error: `El archivo supera el máximo de ${tope} MB.` });
  }
  if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Solo se puede enviar un archivo por vez.' });
  }
  if (err?.code === 'TIPO_ARCHIVO_NO_PERMITIDO') {
    return res.status(400).json({ error: err.message });
  }
  if (err?.message === 'Origen no permitido por CORS.') {
    return res.status(403).json({ error: err.message });
  }
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(port, () => {
    console.log(`Servidor Backend RAG corriendo en http://localhost:${port}`);
});
