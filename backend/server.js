import express from 'express';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { randomInt } from 'node:crypto';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import jwt from 'jsonwebtoken';
// Mismo catálogo de cursos que ve el estudiante. El servidor valida contra él
// porque el cuerpo de la petición lo controla el navegador: sin esto, un
// cliente manipulado puede meter un curso o una sección que no existen y el
// Tercio recibe un reclamo imposible de tramitar.
import CURSOS_SECCIONES from '../src/data/cursos_secciones.json' with { type: 'json' };
import { PROMPT_TEFI } from './promptTefi.js';
import { initializeApp as initFirebaseApp, cert as firebaseCert } from 'firebase-admin/app';
import { getAuth as getFirebaseAuth } from 'firebase-admin/auth';
import { GoogleGenAI } from '@google/genai';


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

// ── Límites de tasa ─────────────────────────────────────────────────────────
// Ojo con el escenario real: cientos de alumnos pueden entrar desde la misma
// red de la UNI y salir con una sola IP pública. Por eso los límites de las
// rutas autenticadas se cuentan por CORREO (que viene del JWT ya verificado) y
// no por IP — si no, el primer alumno consumiría la cuota de todos.
// ipKeyGenerator normaliza la IP antes de usarla como clave. Con IPv6 crudo el
// límite se evade: cada usuario tiene un /64 entero de direcciones distintas y
// cada una abriría su propia cubeta. El helper las agrupa por subred.
const claveIp = (req) => ipKeyGenerator(req.ip);
const porCorreo = (req) => req.body?.email?.toLowerCase?.() || claveIp(req);
const porCorreoOIp = (req) => req.studentEmail || porCorreo(req);

const limiteEnvioCodigo = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,                       // por correo destino: frena el bombardeo de emails
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: porCorreo,
  message: { error: 'Demasiados códigos solicitados para este correo. Espera unos minutos.' },
});

const limiteVerificacion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,                      // segunda barrera contra fuerza bruta del código
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: porCorreo,
  message: { error: 'Demasiados intentos. Espera unos minutos antes de reintentar.' },
});

const limiteSubidas = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: porCorreoOIp,
  message: { error: 'Has subido demasiados archivos seguidos. Espera unos minutos.' },
});

// /api/rag/ask no pide sesión y cada llamada gasta cuota de Gemini (dinero).
const limiteIa = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas seguidas. Espera un momento.' },
});

// ==========================================
// AUTENTICACIÓN: sesión de estudiante (JWT propio) y admin (Firebase)
// ==========================================
if (!process.env.JWT_SECRET) {
  console.error('FALTA JWT_SECRET en el .env — las rutas de estudiante no van a firmar sesiones válidas.');
}

// Verifica el JWT emitido en /api/auth/verify-code y expone el email verificado
// en req.studentEmail. Las rutas NUNCA deben confiar en un email que venga del
// body/query del cliente para decidir de quién son los datos — siempre usan este.
function requireStudentAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sesión requerida. Verifica tu correo primero.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.studentEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Verifica tu correo de nuevo.' });
  }
}

// Igual que requireStudentAuth pero sin cortar la petición: /api/rag/ask es
// pública (se puede preguntar sin iniciar sesión) y debe seguir siéndolo. Esto
// solo sirve para saber a quién atribuir la conversación cuando sí hay sesión.
function emailDeSesionOpcional(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET).email || null;
  } catch {
    return null;
  }
}

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

let firebaseReady = false;
let firebaseAuth = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const firebaseApp = initFirebaseApp({ credential: firebaseCert(serviceAccount) });
    firebaseAuth = getFirebaseAuth(firebaseApp);
    firebaseReady = true;
  } else {
    console.error('FALTA FIREBASE_SERVICE_ACCOUNT en el .env — las rutas /api/admin/* rechazarán todo hasta configurarlo.');
  }
} catch (err) {
  console.error('FIREBASE_SERVICE_ACCOUNT inválido:', err.message);
}

// Cualquier cuenta válida del proyecto Firebase pasaría verifyIdToken — eso no
// basta para decidir "es admin". Solo los correos en esta lista lo son.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);
if (ADMIN_EMAILS.length === 0) {
  console.error('FALTA ADMIN_EMAILS en el .env — las rutas /api/admin/* rechazarán todo hasta configurarlo.');
}

// Algunas acciones (indexar la base de conocimiento de Tefi, activar el modo
// mantenimiento) afectan a TODOS los estudiantes a la vez, así que se restringen
// al administrador principal en vez de a cualquier cuenta de ADMIN_EMAILS.
const CATALOGO_CURSOS = new Map(CURSOS_SECCIONES.map((c) => [c.codigo, c]));

const SUPER_ADMIN_EMAIL = 'ricco.rashuaman.s@uni.pe';

// Cuentas que entran al panel pero solo miran: ven reclamos, estudiantes y
// conversaciones, y no pueden cambiar nada.
//
// El candado no se pone ruta por ruta sino aquí, sobre el método. De las 18
// rutas que pasan por requireAdminAuth, las 8 GET son lecturas y las otras 10
// escriben (las 9 de /api/admin más /api/rag/upload), sin ninguna excepción en
// ningún sentido. Mirando el método en vez de la ruta queda cubierto también
// cualquier endpoint que se añada mañana, que es justo lo que se olvidaría si
// hubiera que acordarse de repetir la comprobación en cada uno.
const ADMINS_SOLO_LECTURA = (process.env.ADMIN_EMAILS_SOLO_LECTURA || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const esSoloLectura = (email) => ADMINS_SOLO_LECTURA.includes(String(email || '').toLowerCase());

// Verifica el ID token de Firebase que manda Tefiis-admin (admin.currentUser.getIdToken())
// y que el email esté en la lista blanca de admins. Falla cerrado si algo no está configurado.
async function requireAdminAuth(req, res, next) {
  if (!firebaseReady) return res.status(500).json({ error: 'Autenticación de admin no configurada en el servidor.' });
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sesión de admin requerida.' });
  try {
    const decoded = await firebaseAuth.verifyIdToken(token);
    if (!decoded.email || !ADMIN_EMAILS.includes(decoded.email.toLowerCase())) {
      return res.status(403).json({ error: 'Esta cuenta no tiene permisos de administrador.' });
    }
    req.adminEmail = decoded.email;
    req.adminSoloLectura = esSoloLectura(decoded.email);
    if (req.adminSoloLectura && req.method !== 'GET' && req.method !== 'HEAD') {
      return res.status(403).json({ error: 'Esta cuenta es de solo lectura: puede consultar el panel, pero no modificar nada.' });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión de admin inválida o expirada.' });
  }
}

// Inicializar el nuevo SDK de Gemini
const ai = new GoogleGenAI({ apiKey: process.env.VITE_API_KEY });

// ── Envío de correo con respaldo entre proveedores (todos por HTTP API — sin SMTP, funciona en Railway) ──
async function sendViaBrevo({ to, subject, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'TEFIIS · FIIS UNI', email: process.env.FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Brevo error ${res.status}`);
  }
}

async function sendViaResend({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `TEFIIS · FIIS UNI <${process.env.FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Resend error ${res.status}`);
  }
}

async function sendViaMailjet({ to, subject, html }) {
  const auth = Buffer.from(`${process.env.MAILJET_API_KEY}:${process.env.MAILJET_SECRET_KEY}`).toString('base64');
  const res = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Messages: [{
        From: { Email: process.env.FROM_EMAIL, Name: 'TEFIIS · FIIS UNI' },
        To: [{ Email: to }],
        Subject: subject,
        HTMLPart: html,
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.ErrorMessage || `Mailjet error ${res.status}`);
  }
}

// Intenta enviar por Brevo primero. Si falla (ej. se acabaron los créditos del
// día), cae automáticamente a Resend, y si ese también falla, a Mailjet.
async function sendEmail({ to, subject, html }) {
  const cleanEmail = typeof to === 'string' ? to.trim().toLowerCase() : '';
  if (!cleanEmail) {
    throw new Error('No se especificó un correo destinatario válido.');
  }

  const proveedores = [
    { nombre: 'Brevo', enviar: sendViaBrevo, disponible: !!process.env.BREVO_API_KEY },
    { nombre: 'Resend', enviar: sendViaResend, disponible: !!process.env.RESEND_API_KEY },
    { nombre: 'Mailjet', enviar: sendViaMailjet, disponible: !!(process.env.MAILJET_API_KEY && process.env.MAILJET_SECRET_KEY) },
  ].filter(p => p.disponible);

  let ultimoError = null;
  for (const proveedor of proveedores) {
    try {
      await proveedor.enviar({ to: cleanEmail, subject, html });
      return;
    } catch (err) {
      console.error(`[EMAIL] ${proveedor.nombre} falló, probando el siguiente proveedor:`, err.message);
      ultimoError = err;
    }
  }
  throw ultimoError || new Error('No hay proveedores de correo configurados.');
}

// Códigos de verificación en memoria: email → { code, expiresAt }
const codesStore = new Map();

const EMAIL_LOGO_URL = 'https://sistema-tefiis.reclamos.workers.dev/Tefiis.png';
const EMAIL_CODIGO_IMG_URL = 'https://sistema-tefiis.reclamos.workers.dev/codigo-enviado.png';
const EMAIL_RECLAMO_IMG_URL = 'https://sistema-tefiis.reclamos.workers.dev/reclamo-recibido.png';

// Envoltorio visual compartido por todos los correos transaccionales: header con
// logo + footer institucional. Usa tablas e inline styles (no <style> en <head>)
// porque es lo único que Gmail/Outlook renderizan de forma consistente.
function emailTemplate(bodyHtml) {
  return `
    <div style="background:#f3f4f6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto">
        <tr>
          <td style="background:#ffffff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:28px 32px 16px;text-align:center;border-bottom:1px solid #f0f0f2">
                  <img src="${EMAIL_LOGO_URL}" width="48" height="48" alt="TEFIIS" style="display:block;margin:0 auto 10px" />
                  <span style="font-size:13px;font-weight:700;letter-spacing:2px;color:#2563EB">TEFIIS</span>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 32px">
                  ${bodyHtml}
                </td>
              </tr>
              <tr>
                <td style="padding:16px 32px 24px;border-top:1px solid #f0f0f2">
                  <p style="color:#aaa;font-size:11px;margin:12px 0 0;text-align:center">TEFIIS — Facultad de Ingeniería Industrial y de Sistemas, UNI</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

// ==========================================
// EMAIL: ENVIAR CÓDIGO DE VERIFICACIÓN
// ==========================================
// Solo correos institucionales. Sin esto, cualquiera podía pedir un código para
// una dirección arbitraria: se creaba una sesión sin ser de la UNI, y de paso se
// gastaba la cuota de correo mandando mensajes a donde quisieran. El frontend ya
// lo pedía, pero el frontend no es un control.
const CORREO_UNI = /^[^@\s]+@uni\.pe$/i;

// Estudiantes que no pueden entrar a su correo institucional y necesitan
// presentar su reclamo igual. Se añaden a mano, una a una y con el visto bueno
// del Tercio: cada entrada es una puerta abierta fuera de @uni.pe, así que la
// lista se mantiene corta y explícita en vez de flexibilizar la regla.
//
// Hay una copia en src/utils/correosPermitidos.ts para que la interfaz no le
// corte el paso antes de llegar aquí. Esta es la que manda.
const CORREOS_EXCEPCION = new Set([
  'jeancruz.sbp@gmail.com',
]);

const correoPermitido = (email) => {
  const limpio = String(email || '').trim().toLowerCase();
  return CORREO_UNI.test(limpio) || CORREOS_EXCEPCION.has(limpio);
};

app.post('/api/auth/send-code', limiteEnvioCodigo, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  if (!correoPermitido(email)) {
    return res.status(400).json({ error: 'Debes usar tu correo institucional @uni.pe.' });
  }

  // 4 dígitos por decisión de producto. Lo que sostiene la seguridad aquí no es
  // la longitud sino MAX_INTENTOS_CODIGO y los limitadores de tasa: sin ellos el
  // espacio de 10 000 combinaciones se agota en segundos.
  //
  // Se genera con randomInt (CSPRNG) y no con Math.random(), que es predecible:
  // no está pensado para secretos y, observando unos cuantos códigos, se puede
  // inferir el estado del generador y anticipar el siguiente.
  const code = String(randomInt(0, 10_000)).padStart(4, '0');
  codesStore.set(email.toLowerCase(), { code, expiresAt: Date.now() + 5 * 60 * 1000, intentos: 0 });

  // Extraer primer nombre del correo: christopher.albino.s@uni.pe → Christopher
  const primerNombre = email.split('@')[0].split('.')[0];
  const nombre = primerNombre.charAt(0).toUpperCase() + primerNombre.slice(1).toLowerCase();

  try {
    await sendEmail({
      to: email,
      subject: 'Tu código de verificación — TEFIIS',
      html: emailTemplate(`
        <img src="${EMAIL_CODIGO_IMG_URL}" width="220" alt="¡Llegó tu código!" style="display:block;margin:0 auto 20px;max-width:220px;height:auto" />
        <h2 style="color:#1a1a1a;margin:0 0 8px;font-size:20px;text-align:center">Hola, ${nombre}</h2>
        <p style="color:#666;margin:0 0 24px;font-size:14px;line-height:1.5;text-align:center">Ingresa este código en TEFIIS para verificar tu identidad:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#2563EB;border-radius:12px;padding:22px 0;text-align:center">
              <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#ffffff">${code}</span>
            </td>
          </tr>
        </table>
        <p style="color:#999;font-size:13px;margin:20px 0 0;text-align:center">Expira en <strong>5 minutos</strong>. Si no lo solicitaste, ignora este correo.</p>
      `)
    });
    console.log(`Código enviado a ${email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error enviando email:', err);
    res.status(500).json({ error: 'No se pudo enviar el correo. Verifica que el email sea válido.' });
  }
});

// ==========================================
// EMAIL: VERIFICAR CÓDIGO
// ==========================================
// Máximo de intentos por código emitido. Sin esto, el código se puede probar a
// fuerza bruta hasta acertar y quedarse con la sesión del alumno — y con ella,
// acceso a sus documentos. Al agotarse, el código se invalida y hay que pedir
// uno nuevo (lo que a su vez pasa por limiteEnvioCodigo).
const MAX_INTENTOS_CODIGO = 5;

app.post('/api/auth/verify-code', limiteVerificacion, (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email y código requeridos' });

  const stored = codesStore.get(email.toLowerCase());
  if (!stored) return res.status(400).json({ error: 'No hay código activo para este correo. Solicita uno nuevo.' });
  if (Date.now() > stored.expiresAt) {
    codesStore.delete(email.toLowerCase());
    return res.status(400).json({ error: 'El código expiró. Solicita uno nuevo.' });
  }
  if (stored.code !== code.trim()) {
    stored.intentos = (stored.intentos || 0) + 1;
    if (stored.intentos >= MAX_INTENTOS_CODIGO) {
      codesStore.delete(email.toLowerCase());
      return res.status(400).json({ error: 'Demasiados intentos fallidos. Solicita un código nuevo.' });
    }
    return res.status(400).json({ error: 'Código incorrecto. Intenta de nuevo.' });
  }

  codesStore.delete(email.toLowerCase());
  console.log(`Email verificado: ${email}`);
  const cleanEmail = email.toLowerCase();
  const token = jwt.sign({ email: cleanEmail }, process.env.JWT_SECRET, { expiresIn: '24h' });
  logActividad({ actorEmail: cleanEmail, actorType: 'estudiante', accion: 'login' });
  res.json({ success: true, token });
});

// ==========================================
// RECLAMOS: EMAIL DE CONFIRMACIÓN
// ==========================================
// Confirmación del reclamo recién creado. Exige sesión y saca el destinatario y
// los datos del caso de la base, no del cuerpo: sin eso cualquiera podía enviar
// un correo a la dirección que quisiera, con HTML propio dentro, saliendo del
// remitente TEFIIS verificado. Verificado explotándolo antes de cerrarlo.
app.post('/api/reclamos/confirmar', requireStudentAuth, limiteEnvioCodigo, async (req, res) => {
  const { caseId } = req.body;
  if (!caseId) {
    return res.status(400).json({ error: 'El ID del caso es requerido para enviar la confirmación.' });
  }

  let reclamo;
  try {
    // El filtro por email va en la consulta: un id ajeno no devuelve fila, así
    // que no se puede pedir la confirmación del reclamo de otro.
    const r = await sbRest(`/reclamos?select=id,email,nombre,categoria&id=eq.${encodeURIComponent(caseId)}&email=eq.${encodeURIComponent(req.studentEmail)}&limit=1`);
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    reclamo = (await r.json())?.[0];
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  if (!reclamo) return res.status(404).json({ error: 'No se encontró ese reclamo.' });

  const email = reclamo.email;
  const nombre = reclamo.nombre;

  // Se escapa todo lo que se interpola: aunque ahora venga de la base, lo
  // escribió el estudiante y puede traer <, > o & que romperían el correo.
  const esc = (t) => String(t || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const categoria = esc(reclamo.categoria);
  const caseIdSeguro = esc(reclamo.id);

  // Formato peruano: "APELLIDO1 APELLIDO2, NOMBRE1 NOMBRE2" → tomar después de la coma
  const primerNombre = (() => {
    if (typeof nombre === 'string' && nombre.includes(',')) {
      const splitNombre = nombre.split(',');
      if (splitNombre[1]) {
        const parteNombres = splitNombre[1].trim();
        const primer = parteNombres.split(' ').find(p => p.length > 0) || '';
        if (primer) {
          return esc(primer.charAt(0).toUpperCase() + primer.slice(1).toLowerCase());
        }
      }
    }
    const fromEmail = (email || '').split('@')[0].split('.')[0];
    return esc(fromEmail.charAt(0).toUpperCase() + fromEmail.slice(1).toLowerCase() || 'Estudiante');
  })();

  try {
    await sendEmail({
      to: email,
      subject: `Reclamo registrado: ${reclamo.id} — TEFIIS`,
      html: emailTemplate(`
        <img src="${EMAIL_RECLAMO_IMG_URL}" width="220" alt="Tu reclamo ha sido recibido" style="display:block;margin:0 auto 20px;max-width:220px;height:auto" />
        <h2 style="color:#1a1a1a;margin:0 0 8px;font-size:20px;text-align:center">Tu reclamo fue registrado</h2>
        <p style="color:#666;margin:0 0 20px;font-size:14px;line-height:1.5;text-align:center">Hola <strong>${primerNombre}</strong>, tu reclamo ha sido enviado correctamente a la FIIS.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 20px">
              <p style="margin:0;color:#166534;font-size:12px;font-weight:600;letter-spacing:0.5px">ID DE TU CASO</p>
              <p style="font-size:24px;font-weight:700;color:#111;margin:6px 0">${caseIdSeguro}</p>
              <p style="margin:0;color:#4b5563;font-size:13px">Categoría: ${categoria}</p>
            </td>
          </tr>
        </table>
        <p style="color:#666;font-size:13px;margin:20px 0 0">Guarda este ID para consultar el estado de tu reclamo en cualquier momento desde TEFIIS.</p>
      `)
    });
    console.log(`Confirmación enviada a ${email} — ${caseId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error enviando confirmación:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// RECLAMOS: crear / consultar (estudiante) y administrar (admin)
// ==========================================
const sbRest = (path, opts = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, {
  ...opts,
  headers: {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    ...opts.headers,
  },
});

// PostgREST corta la respuesta en 1000 filas y se SALTA el `limit` mayor que se
// le pida, sin error y sin avisar: simplemente devuelve menos. Combinado con un
// `order=...asc` eso no recorta lo viejo sino lo NUEVO, que es como la columna
// "atendido por" acabó perdiendo justo el trabajo del día en cuanto el registro
// pasó de las 1000 filas. Aquí se pide por páginas con Range hasta agotar.
//
// El `path` no debe llevar `limit`: chocaría con el Range y volvería a truncar.
const PAGINA_SB = 1000;
async function sbRestTodo(path, tope = 50000) {
  const filas = [];
  for (let desde = 0; desde < tope; desde += PAGINA_SB) {
    const r = await sbRest(path, {
      headers: { 'Range-Unit': 'items', 'Range': `${desde}-${desde + PAGINA_SB - 1}` },
    });
    if (!r.ok) return { ok: false, respuesta: r };
    const lote = await r.json();
    filas.push(...lote);
    // Una página incompleta significa que ya no queda nada detrás.
    if (lote.length < PAGINA_SB) break;
  }
  return { ok: true, filas };
}

// Historial de actividad: registra acciones significativas (login, subir/borrar
// documentos, crear reclamo, cambiar estado, indexar RAG, mantenimiento). No
// registra lecturas ni eventos internos automáticos, para no volverlo ruido.
// Nunca debe romper el flujo principal si falla, por eso no se espera su resultado.
function logActividad({ actorEmail, actorType, accion, detalle }) {
  sbRest('/activity_log', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      actor_email: actorEmail ? actorEmail.toLowerCase() : null,
      actor_type: actorType,
      accion,
      detalle: detalle || null,
    }),
  }).catch(err => console.error('No se pudo registrar actividad:', err.message));
}

// Estudiante: crear un reclamo nuevo. El email SIEMPRE sale de la sesión
// verificada (req.studentEmail), nunca de lo que mande el cliente en el body.
app.post('/api/reclamos', requireStudentAuth, async (req, res) => {
  // Se comprueba aquí y no solo en la interfaz: ocultar el botón no impide que
  // alguien llame al endpoint directamente, así que el cierre tiene que valer
  // en el servidor para ser un cierre de verdad.
  if (await tefiDurmiendoActivo()) {
    // Aparte de la ventana de reclamos: aquélla la abre y cierra El Tercio para
    // regular el flujo; esta apaga la plataforma entera, y antes solo lo hacía
    // en la pantalla, no en el servidor —una pestaña abierta desde antes podía
    // seguir enviando reclamos sin que nadie se enterara—.
    return res.status(503).json({ error: 'Tefi está durmiendo y no se pueden enviar reclamos por ahora. Vuelve a intentarlo cuando despierte.' });
  }
  if (await despedidaActivaPara(req.studentEmail)) {
    return res.status(503).json({ error: 'El proceso de matrícula ha terminado. Nos vemos el siguiente ciclo.' });
  }
  if (!(await puedeEnviarReclamo(req.studentEmail))) {
    return res.status(503).json({ error: 'La ventana de reclamos está cerrada en este momento. Vuelve a intentarlo cuando El Tercio la habilite.' });
  }

  const { nombre, codigo_estudiante, categoria, descripcion, datos_estudiante, documentos, evidencias, cursos_retirar, cursos_matricular } = req.body;
  if (!categoria || !descripcion) return res.status(400).json({ error: 'Categoría y descripción son requeridas.' });

  // Las evidencias llegan como referencias que el cliente recibió al subirlas.
  // Se revalidan aquí porque el navegador podría mandar la referencia de otro
  // estudiante: sin esta comprobación, un reclamo apuntaría a archivos ajenos.
  const listaEvidencias = Array.isArray(evidencias) ? evidencias : [];
  if (listaEvidencias.length > MAX_EVIDENCIAS) {
    return res.status(400).json({ error: 'Solo puedes adjuntar un archivo PDF como prueba.' });
  }
  const evidenciasValidas = listaEvidencias.filter((e) => esEvidenciaPropia(e?.ref, req.studentEmail));
  if (evidenciasValidas.length !== listaEvidencias.length) {
    return res.status(403).json({ error: 'Alguno de los archivos adjuntos no te pertenece.' });
  }

  // Los cursos llegan del catálogo cerrado que ve el estudiante, pero el cuerpo
  // de la petición lo controla el navegador: se recortan y se acotan para que un
  // cliente manipulado no meta texto arbitrario ni una lista enorme.
  const MAX_CURSOS = 30;
  const sanearCursos = (lista) => (Array.isArray(lista) ? lista : [])
    .slice(0, MAX_CURSOS)
    .map((c) => {
      const codigo = String(c?.codigo || '').trim().toUpperCase();
      const seccion = String(c?.seccion || '').trim().toUpperCase();
      const delCatalogo = CATALOGO_CURSOS.get(codigo);
      // El nombre se toma del catálogo y no del cliente: así no puede llegar un
      // código real con un nombre falso al lado.
      if (!delCatalogo || !delCatalogo.secciones.includes(seccion)) return null;
      return { codigo, nombre: delCatalogo.nombre, seccion };
    })
    .filter(Boolean);

  const cursosRetirar = sanearCursos(cursos_retirar);
  const cursosMatricular = sanearCursos(cursos_matricular);

  // Se guardan dentro de `documentos` y no en una columna nueva para no exigir
  // un cambio de esquema; la clave es aparte, así que los reclamos viejos —que
  // no la traen— siguen leyéndose igual.
  const documentosConEvidencias = {
    ...(documentos && typeof documentos === 'object' ? documentos : {}),
    ...(evidenciasValidas.length ? { evidencias: evidenciasValidas.map((e) => ({
      ref: e.ref,
      nombre: String(e.nombre || 'archivo').slice(0, 120),
      tipo: String(e.tipo || '').slice(0, 60),
      bytes: Number(e.bytes) || 0,
    })) } : {}),
  };

  try {
    const year = new Date().getFullYear();

    // El id se arma leyendo el último y sumando uno. Eso es una condición de
    // carrera: con muchos alumnos reclamando a la vez, varios leen el mismo
    // "último" y calculan el mismo id. Como id es la PK de la tabla, todos menos
    // uno reciben 409 y el reclamo se pierde con un error genérico — justo en el
    // momento de mayor demanda (cierre de matrícula).
    //
    // Se reintenta releyendo el máximo. El desfase por intento evita que todos
    // los que colisionaron vuelvan a pelear por el mismo número siguiente.
    // Guarda contra duplicados. Un reintento del mismo reclamo devuelve el que
    // ya existe en vez de crear otro, así que la operación es idempotente y da
    // igual si el cliente reintenta por un fallo de red, por un doble clic o
    // porque su versión de la página le mostró un error después de haberlo
    // creado. Se compara el texto porque un mismo alumno sí puede mandar dos
    // reclamos distintos seguidos, y esos deben pasar.
    const VENTANA_DUPLICADO_MS = 10 * 60 * 1000;
    try {
      const desde = new Date(Date.now() - VENTANA_DUPLICADO_MS).toISOString();
      const previos = await sbRest(`/reclamos?select=id,descripcion&email=eq.${encodeURIComponent(req.studentEmail)}&created_at=gte.${encodeURIComponent(desde)}&order=created_at.desc&limit=10`);
      if (previos.ok) {
        const filas = await previos.json();
        const mismo = filas.find((f) => String(f.descripcion || '').trim() === String(descripcion).trim());
        if (mismo) {
          console.log(`Reclamo duplicado evitado para ${req.studentEmail}: ya existe ${mismo.id}`);
          return res.json({ success: true, id: mismo.id, duplicado: true });
        }
      }
    } catch (err) {
      // Si la comprobación falla se sigue adelante: perder un reclamo por no
      // poder comprobar si es repetido sería peor que aceptar un duplicado.
      console.error('No se pudo comprobar duplicados:', err.message);
    }

    const MAX_INTENTOS_ID = 10;
    let caseId = null;
    let insertado = false;
    let ultimoError = null;

    // El número sale de una secuencia de Postgres, no del id más alto de la
    // tabla. Dos motivos:
    //
    // 1. Una secuencia nunca retrocede. Con el máximo de la tabla, borrar el
    //    último reclamo dejaba su número libre y el siguiente lo heredaba junto
    //    con lo que colgara de él —así apareció la respuesta de una prueba en el
    //    reclamo de otra estudiante—.
    // 2. nextval es atómico. Leer el máximo y luego insertar es una carrera:
    //    con varios alumnos enviando a la vez, dos leían el mismo número, uno
    //    fallaba por clave duplicada y reintentaba con el siguiente, dejando
    //    huecos en la numeración.
    //
    // Si la secuencia todavía no existe se sigue con el método anterior, para
    // no dejar de aceptar reclamos por un paso pendiente en la base.
    let numeroDeSecuencia = null;
    try {
      const r = await sbRest('/rpc/siguiente_id_reclamo', { method: 'POST', body: '{}' });
      if (r.ok) {
        const n = await r.json();
        if (Number.isFinite(Number(n))) numeroDeSecuencia = Number(n);
      }
    } catch (err) {
      console.error('No se pudo usar la secuencia de ids:', err.message);
    }

    for (let intento = 0; intento < MAX_INTENTOS_ID && !insertado; intento++) {
      let nextNum;
      if (numeroDeSecuencia !== null) {
        // Cada reintento pide otro número, porque el anterior ya se consumió.
        nextNum = intento === 0 ? numeroDeSecuencia : null;
        if (nextNum === null) {
          const r2 = await sbRest('/rpc/siguiente_id_reclamo', { method: 'POST', body: '{}' });
          nextNum = r2.ok ? Number(await r2.json()) : numeroDeSecuencia + intento;
        }
        caseId = `REC-${year}-${String(nextNum).padStart(4, '0')}`;
      } else {
        const lastRes = await sbRest(`/reclamos?select=id&id=like.REC-${year}-*&order=id.desc&limit=1`);
        const last = lastRes.ok ? await lastRes.json() : [];
        nextNum = 1;
        if (last.length > 0) {
          const partes = last[0].id.split('-');
          const ultimo = parseInt(partes[2], 10);
          if (!isNaN(ultimo)) nextNum = ultimo + 1;
        }
        caseId = `REC-${year}-${String(nextNum + intento).padStart(4, '0')}`;
      }

      const r = await sbRest('/reclamos', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          id: caseId,
          email: req.studentEmail,
          nombre: nombre || null,
          codigo_estudiante: codigo_estudiante || null,
          categoria,
          descripcion,
          datos_estudiante: {
          ...(datos_estudiante && typeof datos_estudiante === 'object' ? datos_estudiante : {}),
          cursosRetirar,
          cursosMatricular,
        },
          documentos: documentosConEvidencias,
          estado: 'PENDIENTE',
          // Columnas heredadas del esquema anterior: se mantienen espejadas para no dejarlas vacías.
          nombres: nombre || null,
          codigo: codigo_estudiante || null,
          urls: documentosConEvidencias,
          datos_academicos: datos_estudiante || null,
        }),
      });

      if (r.ok) { insertado = true; break; }

      ultimoError = await r.text();
      // 409 / 23505 = otro reclamo ganó ese id. Cualquier otro error es real.
      const esColision = r.status === 409 || ultimoError.includes('23505');
      if (!esColision) return res.status(500).json({ error: ultimoError });
    }

    if (!insertado) {
      console.error('No se pudo asignar un id de reclamo tras varios intentos:', ultimoError);
      return res.status(503).json({ error: 'El sistema está recibiendo muchos reclamos a la vez. Intenta de nuevo en unos segundos.' });
    }

    logActividad({ actorEmail: req.studentEmail, actorType: 'estudiante', accion: 'reclamo_creado', detalle: { caseId, categoria, evidencias: evidenciasValidas.length } });
    res.json({ success: true, id: caseId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Estudiante: ver solo sus propios reclamos (filtrado por el email de su sesión, no por query param)
app.get('/api/reclamos/mine', requireStudentAuth, async (req, res) => {
  try {
    const r = await sbRest(`/reclamos?select=id,categoria,estado,created_at,respuesta&email=eq.${encodeURIComponent(req.studentEmail)}&order=created_at.desc`);
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    const reclamos = await r.json();

    // Igual que en el detalle: aquí se muestra lo comunicado, no el estado de
    // trabajo. Se piden los envíos de todos sus reclamos de una vez en lugar de
    // uno por uno.
    const ids = reclamos.map(x => x.id).filter(Boolean);
    const ultimoComunicado = {};
    if (ids.length) {
      const lista = ids.map(id => `"${id}"`).join(',');
      const envios = await sbRest(`/respuestas_reclamo?select=reclamo_id,estado,created_at&reclamo_id=in.(${encodeURIComponent(lista)})&order=created_at.asc`);
      if (envios.ok) {
        // Van en orden ascendente, así que el último que se escribe de cada
        // reclamo es el más reciente.
        for (const e of await envios.json()) ultimoComunicado[e.reclamo_id] = e.estado;
      }
    }

    res.json(reclamos.map(x => ({
      id: x.id,
      categoria: x.categoria,
      created_at: x.created_at,
      estado: ultimoComunicado[x.id] || (x.respuesta ? (x.estado || 'PENDIENTE') : 'PENDIENTE'),
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: guardar los datos académicos que el panel extrajo de los PDF.
//
// Aquí no se parsea nada: la extracción ocurre en el navegador del admin, en
// Tefiis-admin, y esta ruta solo persiste el resultado. El parseo salió de este
// proyecto a propósito — corriendo en el servidor bloqueaba el único hilo de
// Node y, en el navegador del alumno, le cargaba un trabajo que no le sirve.
app.put('/api/admin/estudiantes/:email/datos', requireAdminAuth, async (req, res) => {
  const email = String(req.params.email || '').trim().toLowerCase();
  const { datosParseados, datosPlanos, codigo } = req.body;

  if (!email) return res.status(400).json({ error: 'Correo requerido.' });
  if (!datosParseados || typeof datosParseados !== 'object') {
    return res.status(400).json({ error: 'Faltan los datos extraídos.' });
  }

  try {
    const r = await sbRest(`/documentos_estudiante?select=datos_parseados&email=eq.${encodeURIComponent(email)}&limit=1`);
    const fila = r.ok ? (await r.json())?.[0] : null;
    if (!fila) return res.status(404).json({ error: 'Ese estudiante no tiene documentos guardados.' });

    // El contacto lo escribe el estudiante y no sale de los PDF: se conserva
    // para que volver a extraer no le borre su teléfono y su turno.
    const guardado = await sbRest('/documentos_estudiante?on_conflict=email', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        email,
        codigo_estudiante: codigo || null,
        datos_parseados: { ...datosParseados, _contacto: fila.datos_parseados?._contacto || {} },
        datos_academicos: datosPlanos || {},
        updated_at: new Date().toISOString(),
      }),
    });
    if (!guardado.ok) { const t = await guardado.text(); return res.status(500).json({ error: t }); }

    logActividad({
      actorEmail: req.adminEmail,
      actorType: 'admin',
      accion: 'datos_estudiante_extraidos',
      detalle: { estudiante: email, codigo: codigo || null },
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: enviar al estudiante la respuesta de su reclamo por correo.
//
// El destinatario y los datos del caso salen de la base y NO del cuerpo de la
// petición. Si se tomaran del body, esta ruta sería un enviador de correo a
// cualquier dirección con el remitente de TEFIIS: bastaría una sesión de admin
// para mandar correos a quien fuera con la marca de la facultad.
app.post('/api/admin/reclamos/:id/responder', requireAdminAuth, async (req, res) => {
  const { respuesta } = req.body;
  if (!respuesta || !String(respuesta).trim()) {
    return res.status(400).json({ error: 'La respuesta no puede estar vacía.' });
  }

  try {
    const r = await sbRest(`/reclamos?select=id,email,nombre,categoria,estado&id=eq.${encodeURIComponent(req.params.id)}&limit=1`);
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    const reclamo = (await r.json())?.[0];
    if (!reclamo) return res.status(404).json({ error: 'No se encontró ese reclamo.' });
    if (!reclamo.email) return res.status(400).json({ error: 'El reclamo no tiene un correo asociado.' });

    const estado = reclamo.estado || 'PENDIENTE';
    // Cada desenlace con su color y su texto. Los estados intermedios
    // (PENDIENTE, EN_REVISION) caen en el azul de "en revisión".
    const DESENLACES = {
      ACEPTADO:              { color: '#059669', texto: 'ACEPTADO' },
      ACEPTADO_PARCIALMENTE: { color: '#ea580c', texto: 'ACEPTADO PARCIALMENTE' },
      RECHAZADO:             { color: '#dc2626', texto: 'RECHAZADO' },
      MATRICULADO:           { color: '#0f766e', texto: 'MATRICULADO' },
    };
    const { color: colorEstado, texto: textoEstado } =
      DESENLACES[estado] || { color: '#2563EB', texto: 'EN REVISIÓN' };

    // Formato peruano: "APELLIDO1 APELLIDO2, NOMBRE1" → tomar el nombre de pila.
    const nombreCompleto = (reclamo.nombre || '').trim();
    const primerNombre = nombreCompleto.includes(',')
      ? nombreCompleto.split(',')[1]?.trim().split(/\s+/)[0]
      : nombreCompleto.split(/\s+/)[0];
    const saludo = primerNombre
      ? `Hola, ${primerNombre.charAt(0).toUpperCase()}${primerNombre.slice(1).toLowerCase()}`
      : 'Hola';

    // escapeHtml, no interpolación directa: la respuesta la escribe un humano en
    // un textarea y puede traer <, > o & que romperían el correo.
    const escapeHtml = (t) => String(t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const respuestaHtml = escapeHtml(respuesta).replace(/\n/g, '<br />');

    await sendEmail({
      to: reclamo.email,
      subject: `Respuesta a tu reclamo ${reclamo.id} — TEFIIS`,
      html: emailTemplate(`
        <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827">${saludo}</p>
        <p style="margin:0 0 20px;font-size:14px;color:#4b5563">
          El Tercio revisó tu reclamo <strong>${reclamo.id}</strong>${reclamo.categoria ? ` sobre ${escapeHtml(reclamo.categoria)}` : ''}.
        </p>
        <p style="margin:0 0 20px;text-align:center">
          <span style="display:inline-block;padding:8px 18px;border-radius:999px;background:${colorEstado}1a;color:${colorEstado};font-size:13px;font-weight:700;letter-spacing:1px">
            ${textoEstado}
          </span>
        </p>
        <div style="background:#f9fafb;border-left:3px solid ${colorEstado};border-radius:6px;padding:16px 18px;margin:0 0 20px">
          <p style="margin:0;font-size:14px;line-height:1.6;color:#111827">${respuestaHtml}</p>
        </div>
        <p style="margin:0;font-size:13px;color:#6b7280">
          Puedes revisar el estado de tus reclamos en cualquier momento desde TEFIIS.
        </p>
      `),
    });

    logActividad({
      actorEmail: req.adminEmail,
      actorType: 'admin',
      accion: 'reclamo_respondido',
      detalle: { caseId: reclamo.id, estado },
    });

    // Historial de envíos: una fila por cada vez que se manda un correo, no un
    // campo que se sobrescribe. Así un reclamo con dos idas y vueltas conserva
    // el primer mensaje aunque se envíe uno nuevo.
    const entrada = { reclamo_id: reclamo.id, estado, mensaje: respuesta, admin_email: req.adminEmail };
    let creado_en = new Date().toISOString();
    try {
      const ins = await sbRest('/respuestas_reclamo', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(entrada),
      });
      if (ins.ok) {
        const fila = (await ins.json())?.[0];
        if (fila?.created_at) creado_en = fila.created_at;
      } else {
        console.error('No se pudo guardar el historial de respuesta:', await ins.text());
      }
    } catch (errHist) {
      // El correo ya se envió: no se puede fallar la petición por esto. El
      // admin se entera igual, solo que esa entrada no sobrevivirá a un reload.
      console.error('No se pudo guardar el historial de respuesta:', errHist.message);
    }

    res.json({ ok: true, entrada: { ...entrada, created_at: creado_en } });
  } catch (err) {
    console.error('No se pudo enviar la respuesta del reclamo:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Historial de correos enviados para un reclamo. Cualquier admin autorizado
// puede verlo: ya ve el campo "respuesta" actual del reclamo, esto solo agrega
// las versiones anteriores si hubo más de un envío.
app.get('/api/admin/reclamos/:id/respuestas', requireAdminAuth, async (req, res) => {
  try {
    const r = await sbRest(`/respuestas_reclamo?select=estado,mensaje,admin_email,created_at&reclamo_id=eq.${encodeURIComponent(req.params.id)}&order=created_at.asc`);
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Estudiante: el detalle de UN reclamo suyo, con su ciclo de vida.
app.get('/api/reclamos/mine/:id', requireStudentAuth, async (req, res) => {
  const caseId = req.params.id;
  try {
    // El filtro por email va en la consulta, no en una comprobación posterior:
    // así un id ajeno simplemente no devuelve fila y no hay forma de distinguir
    // "no es tuyo" de "no existe", que es lo que conviene no revelar.
    const r = await sbRest(`/reclamos?select=*&id=eq.${encodeURIComponent(caseId)}&email=eq.${encodeURIComponent(req.studentEmail)}&limit=1`);
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    const filas = await r.json();
    const reclamo = filas?.[0];
    if (!reclamo) return res.status(404).json({ error: 'No se encontró ese reclamo.' });

    // El estudiante ve lo que se le COMUNICÓ, no el estado con el que el Tercio
    // trabaja por dentro. Mientras se delibera, el estado va y viene en el panel
    // —en revisión, aceptado, rechazado— y nada de eso le incumbe hasta que
    // alguien decide escribirle.
    //
    // Cada correo enviado deja una fila en respuestas_reclamo, así que esa tabla
    // es justo el registro de lo que él sabe: su historial y su estado salen de
    // ahí y no de activity_log, que recoge también el trabajo interno.
    const envios = await sbRest(`/respuestas_reclamo?select=estado,created_at&reclamo_id=eq.${encodeURIComponent(caseId)}&order=created_at.asc`);
    const comunicados = envios.ok ? await envios.json() : [];

    const eventos = [{ fecha: reclamo.created_at, tipo: 'creado', estado: null }];
    for (const envio of comunicados) {
      eventos.push({ fecha: envio.created_at, tipo: 'estado', estado: envio.estado });
    }

    // Sin ningún correo enviado, para él sigue pendiente por mucho que por
    // dentro esté en revisión. La excepción son los reclamos respondidos antes
    // de que existiera respuestas_reclamo: ahí ya se le comunicó algo, así que
    // se cae al estado guardado en vez de mentirle diciendo PENDIENTE.
    const estadoVisible = comunicados.length
      ? comunicados[comunicados.length - 1].estado
      : (reclamo.respuesta ? (reclamo.estado || 'PENDIENTE') : 'PENDIENTE');

    // Se devuelve solo lo que le corresponde ver al estudiante. `comentario` es
    // la nota interna del admin y se queda fuera a propósito: la UI del panel la
    // rotula "no se envía al estudiante".
    res.json({
      id: reclamo.id,
      categoria: reclamo.categoria,
      descripcion: reclamo.descripcion,
      estado: estadoVisible,
      created_at: reclamo.created_at,
      respuesta: reclamo.respuesta || null,
      evidencias: (reclamo.documentos?.evidencias || []).map(e => ({
        nombre: e.nombre,
        tipo: e.tipo,
        bytes: e.bytes,
      })),
      // Lo que pidió sobre cursos es suyo y forma parte de lo que envió: sin
      // esto tendría que fiarse de memoria de qué secciones marcó.
      cursosRetirar: reclamo.datos_estudiante?.cursosRetirar || [],
      cursosMatricular: reclamo.datos_estudiante?.cursosMatricular || [],
      historial: eventos,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: ver todos los reclamos
app.get('/api/admin/reclamos', requireAdminAuth, async (req, res) => {
  try {
    const r = await sbRest('/reclamos?select=*&order=created_at.desc');
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: ver todos los estudiantes con documentos registrados
app.get('/api/admin/estudiantes', requireAdminAuth, async (req, res) => {
  try {
    const r = await sbRest('/documentos_estudiante?select=*&order=updated_at.desc');
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: actualizar estado/comentario/respuesta de un reclamo
// Las cuatro carreras de la FIIS. La corrección de especialidad solo puede
// escribir uno de estos nombres: el admin manda cuál, no el texto libre, así
// un token robado no puede meter cualquier cosa dentro del JSON del reclamo.
const ESPECIALIDADES_FIIS = [
  'Ingeniería Industrial',
  'Ingeniería de Sistemas',
  'Ingeniería de Software',
  'Ingeniería de Inteligencia Artificial',
];

// Los estados que puede tener un reclamo. Antes se guardaba lo que llegara en
// el cuerpo, así que un error de tecleo dejaba un estado inexistente en la base
// que ningún filtro ni contador del panel sabía mostrar.
const ESTADOS_RECLAMO = [
  'PENDIENTE',
  'EN_REVISION',
  'ACEPTADO',
  'ACEPTADO_PARCIALMENTE',
  'RECHAZADO',
  'MATRICULADO',
];

// MATRICULADO cierra el caso: la matrícula ya se ejecutó y no hay marcha atrás
// posible en la vida real, así que tampoco la hay aquí. El candado va en el
// servidor y no solo en el panel: bloquearlo únicamente en la interfaz lo
// dejaría a un clic de cualquiera con el token.
const ESTADO_FINAL = 'MATRICULADO';

app.patch('/api/admin/reclamos/:id', requireAdminAuth, async (req, res) => {
  const { estado, comentario, respuesta, especialidad } = req.body;

  if (estado !== undefined && !ESTADOS_RECLAMO.includes(estado)) {
    return res.status(400).json({ error: 'Ese no es un estado válido de reclamo.' });
  }

  const patch = {};
  if (estado !== undefined) patch.estado = estado;
  if (comentario !== undefined) patch.comentario = comentario;
  if (respuesta !== undefined) patch.respuesta = respuesta;

  if (especialidad !== undefined && !ESPECIALIDADES_FIIS.includes(especialidad)) {
    return res.status(400).json({ error: 'Esa especialidad no es una de la FIIS.' });
  }
  if (Object.keys(patch).length === 0 && especialidad === undefined) {
    return res.status(400).json({ error: 'Nada que actualizar.' });
  }
  try {
    // La especialidad vive dentro de datos_estudiante, que es un JSON con
    // muchas más cosas (teléfono, turno, cursos, el parseo entero). Se lee y se
    // reescribe aquí, tocando solo esa clave: si el cliente mandara el objeto
    // completo, un envío con datos viejos borraría lo que otro admin acabara
    // de cambiar.
    if (especialidad !== undefined) {
      const actual = await sbRest(`/reclamos?id=eq.${encodeURIComponent(req.params.id)}&select=datos_estudiante`);
      if (!actual.ok) { const t = await actual.text(); return res.status(500).json({ error: t }); }
      const filas = await actual.json();
      if (filas.length === 0) return res.status(404).json({ error: 'Ese reclamo no existe.' });

      const datos = filas[0].datos_estudiante || {};
      // Lo que declaró el estudiante se guarda la primera vez que se corrige,
      // no en cada corrección: si no, una segunda pasada lo sobrescribiría con
      // el valor ya corregido y se perdería el original.
      if (datos.especialidadDeclarada === undefined) {
        datos.especialidadDeclarada = datos.especialidad ?? null;
      }
      datos.especialidad = especialidad;
      patch.datos_estudiante = datos;
    }

    // Un reclamo ya matriculado no se toca más. Se comprueba contra lo que hay
    // guardado, no contra lo que diga el cliente: el panel oculta los botones,
    // pero eso no impide llamar a la API a mano. Repetir el mismo estado se
    // deja pasar, para que reenviar el correo no choque con esto.
    if (estado !== undefined) {
      const previo = await sbRest(`/reclamos?id=eq.${encodeURIComponent(req.params.id)}&select=estado`);
      if (previo.ok) {
        const fila = (await previo.json())?.[0];
        if (fila && fila.estado === ESTADO_FINAL && estado !== ESTADO_FINAL) {
          return res.status(409).json({
            error: 'Este reclamo ya está MATRICULADO y no se puede volver a cambiar de estado.',
          });
        }
      }
    }

    // return=representation, no minimal: un PATCH sobre un id que no existe
    // actualiza cero filas y Supabase responde ok igual, así que sin mirar lo
    // devuelto se contestaba "guardado" por un reclamo inexistente.
    const r = await sbRest(`/reclamos?id=eq.${encodeURIComponent(req.params.id)}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    const actualizadas = await r.json().catch(() => []);
    if (!Array.isArray(actualizadas) || actualizadas.length === 0) {
      return res.status(404).json({ error: 'Ese reclamo no existe.' });
    }
    // En el registro va solo la especialidad, no el JSON entero: el historial
    // debe poder leerse.
    const { datos_estudiante, ...paraElLog } = patch;
    logActividad({
      actorEmail: req.adminEmail, actorType: 'admin', accion: 'reclamo_actualizado',
      detalle: { caseId: req.params.id, ...paraElLog, ...(especialidad !== undefined ? { especialidad } : {}) },
    });
    res.json({ success: true, ...(especialidad !== undefined ? { datos_estudiante: patch.datos_estudiante } : {}) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: guardar qué cursos-sección se matriculan y cuáles se retiran de
// verdad. Es la decisión del Tercio, no lo que pidió el estudiante, y NO se le
// muestra a él: vive en su propia columna y los dos endpoints que consulta el
// estudiante piden columnas por nombre, así que esta no sale por ahí.
const cursosValidos = (lista, campo) => {
  if (lista === undefined) return [];
  if (!Array.isArray(lista)) throw new Error(`"${campo}" debe ser una lista.`);
  if (lista.length > 40) throw new Error(`Demasiados cursos en "${campo}".`);
  return lista.map((c) => {
    const codigo = String(c?.codigo || '').trim().toUpperCase();
    const seccion = String(c?.seccion || '').trim().toUpperCase();
    // El nombre es solo para leerlo en el panel; el par código-sección es lo
    // que identifica de verdad, así que es lo único que se exige.
    if (!codigo || !seccion) throw new Error(`Cada curso de "${campo}" necesita código y sección.`);
    return { codigo, seccion, nombre: String(c?.nombre || '').trim().slice(0, 120) };
  });
};

app.put('/api/admin/reclamos/:id/cursos-resueltos', requireAdminAuth, async (req, res) => {
  let matricular, desmatricular;
  try {
    matricular = cursosValidos(req.body?.matricular, 'matricular');
    desmatricular = cursosValidos(req.body?.desmatricular, 'desmatricular');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    const actual = await sbRest(`/reclamos?id=eq.${encodeURIComponent(req.params.id)}&select=cursos_resueltos`);
    if (!actual.ok) {
      const t = await actual.text();
      // La columna se añade con sql/cursos_resueltos.sql. Sin ella la respuesta
      // de PostgREST es críptica, así que se traduce.
      if (t.includes('cursos_resueltos')) {
        return res.status(500).json({ error: 'Falta la columna cursos_resueltos: ejecuta sql/cursos_resueltos.sql en Supabase.' });
      }
      return res.status(500).json({ error: t });
    }
    const filas = await actual.json();
    if (filas.length === 0) return res.status(404).json({ error: 'Ese reclamo no existe.' });

    const previo = filas[0].cursos_resueltos || {};
    const ahora = new Date().toISOString();
    // El historial es de solo añadir: cada guardado deja su huella con quién y
    // cuándo, para poder reconstruir quién decidió qué aunque se cambie luego.
    const historial = Array.isArray(previo.historial) ? previo.historial.slice(-49) : [];
    historial.push({ admin: req.adminEmail, fecha: ahora, matricular, desmatricular });

    const valor = { matricular, desmatricular, actualizadoPor: req.adminEmail, actualizadoEn: ahora, historial };

    const r = await sbRest(`/reclamos?id=eq.${encodeURIComponent(req.params.id)}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ cursos_resueltos: valor }),
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    const actualizadas = await r.json().catch(() => []);
    if (!Array.isArray(actualizadas) || actualizadas.length === 0) {
      return res.status(404).json({ error: 'Ese reclamo no existe.' });
    }

    logActividad({
      actorEmail: req.adminEmail, actorType: 'admin', accion: 'cursos_resueltos',
      detalle: {
        caseId: req.params.id,
        matricular: matricular.map(c => `${c.codigo}-${c.seccion}`),
        desmatricular: desmatricular.map(c => `${c.codigo}-${c.seccion}`),
      },
    });
    res.json({ success: true, cursos_resueltos: valor });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: obtener una signed URL para ver el documento de cualquier estudiante
app.get('/api/admin/docs/signed-url', requireAdminAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url requerida' });
  try {
    const signedUrl = await createSignedUrl(url);
    res.json({ signedUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Configurar multer para recibir archivos temporales desde React
const uploadDir = path.join(__dirname, '../uploads');
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
// Sin límite, cualquiera con sesión puede mandar un archivo enorme y tumbar el
// proceso (uploadMemory lo carga entero en RAM). Y sin filtro de tipo se acepta
// cualquier binario disfrazado de PDF: el parser lo abriría igual.
// Se marca con un código en vez de reconocer el error por su texto: así se
// puede reescribir el mensaje sin que el manejador deje de identificarlo.
function errorTipoArchivo(mensaje) {
  const err = new Error(mensaje);
  err.code = 'TIPO_ARCHIVO_NO_PERMITIDO';
  return err;
}

const MAX_PDF_BYTES = 15 * 1024 * 1024;   // 15 MB

// Cada ruta tiene su propio tope y multer no lo incluye en el error, así que el
// manejador final informaba siempre el de los PDF. Se anota antes de subir.
const marcarLimite = (bytes) => (req, res, next) => { req.limiteBytes = bytes; next(); };

function soloPdf(req, file, cb) {
  const esPdf = file.mimetype === 'application/pdf' &&
                /\.pdf$/i.test(file.originalname || '');
  if (!esPdf) return cb(errorTipoArchivo('Solo se aceptan archivos PDF.'));
  cb(null, true);
}

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
const RAG_STORE_KEY = 'rag_store_name';
const RAG_STORE_TTL_MS = 5 * 60 * 1000;

let currentStoreName = null;
let ragStoreLeidoEn = 0;

// Respaldo: archivo heredado, por si la base todavía no tiene la clave.
const storeIdFile = path.join(__dirname, '.rag_store_id');
if (fs.existsSync(storeIdFile)) {
    currentStoreName = fs.readFileSync(storeIdFile, 'utf8').trim();
}

async function obtenerStoreRag({ forzar = false } = {}) {
    const vencido = Date.now() - ragStoreLeidoEn > RAG_STORE_TTL_MS;
    if (!forzar && !vencido && currentStoreName) return currentStoreName;
    try {
        const r = await sbRest(`/app_settings?select=value&key=eq.${RAG_STORE_KEY}`);
        if (r.ok) {
            const filas = await r.json();
            const valor = filas?.[0]?.value;
            if (typeof valor === 'string' && valor.trim()) {
                if (valor !== currentStoreName) {
                    console.log(`Cerebro RAG actualizado a: ${valor}`);
                }
                currentStoreName = valor.trim();
            }
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
app.post('/api/rag/upload', requireAdminAuth, limiteSubidas, marcarLimite(MAX_PDF_BYTES), upload.single('file'), async (req, res) => {
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
app.post('/api/rag/ask', limiteIa, async (req, res) => {
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

        // Usamos gemini-2.5-flash porque es el que tu API Key gratuita tiene habilitado
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
app.get('/api/admin/conversaciones', requireAdminAuth, async (req, res) => {
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

app.get('/api/admin/conversaciones/:email', requireAdminAuth, async (req, res) => {
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
// DOCS: GUARDAR / CARGAR DOCUMENTOS
// ==========================================
const sbHeaders = () => ({
  'Content-Type': 'application/json',
  'apikey': process.env.SUPABASE_SERVICE_KEY,
  'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
  'Prefer': 'return=minimal'
});

// Los valores guardados en boleta_url/record_notas_url/record_matricula_url tienen el
// El bucket es privado: lo guardado es solo una referencia (bucket + path) que
// el backend convierte en signed URL tras verificar permisos. Nunca es un enlace
// descargable por sí solo.
//
// Se aceptan dos formas porque las filas viejas quedaron con el marcador
// '/object/public/', que era engañoso: sugería que el archivo era público (no lo
// es, la ruta devuelve "Bucket not found"). Las nuevas usan '/object/'. Se prueba
// primero el marcador largo, porque '/object/' también casa dentro de él.
const STORAGE_MARKERS = ['/object/public/', '/object/'];

function parseStorageRef(storedUrl) {
  if (typeof storedUrl !== 'string') return null;
  for (const marker of STORAGE_MARKERS) {
    const idx = storedUrl.indexOf(marker);
    if (idx === -1) continue;
    const [bucket, ...rest] = storedUrl.slice(idx + marker.length).split('/');
    if (!bucket || rest.length === 0) continue;
    return { bucket: decodeURIComponent(bucket), path: rest.map(decodeURIComponent).join('/') };
  }
  return null;
}

async function downloadStorageFile(storedUrl) {
  const ref = parseStorageRef(storedUrl);
  if (!ref) throw new Error(`No se pudo interpretar la referencia de archivo: ${storedUrl}`);
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(ref.bucket)}/${ref.path.split('/').map(encodeURIComponent).join('/')}`, {
    headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
  });
  if (!res.ok) throw new Error(`Error descargando el archivo: ${storedUrl}`);
  return await res.arrayBuffer();
}

async function deleteStorageFile(storedUrl) {
  const ref = parseStorageRef(storedUrl);
  if (!ref) throw new Error(`No se pudo interpretar la referencia de archivo: ${storedUrl}`);
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(ref.bucket)}/${ref.path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE',
    headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
  });
  if (!res.ok) throw new Error(`Error borrando el archivo: ${storedUrl}`);
}

async function createSignedUrl(storedUrl, expiresIn = 600) {
  const ref = parseStorageRef(storedUrl);
  if (!ref) throw new Error('Referencia de archivo inválida');
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(ref.bucket)}/${ref.path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    },
    body: JSON.stringify({ expiresIn })
  });
  if (!res.ok) throw new Error(`No se pudo firmar la URL del archivo: ${storedUrl}`);
  const data = await res.json();
  return `${process.env.SUPABASE_URL}/storage/v1${data.signedURL}`;
}

const sanitizeEmail = (email) => email.toLowerCase().replace('@', '_at_').replace(/\./g, '_');

// Estudiante: obtener una signed URL, pero solo de un documento que sea suyo
// (el path guardado siempre empieza con su carpeta sanitizeEmail(email)/...).
app.get('/api/docs/signed-url', requireStudentAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url requerida' });
  if (!rutaDentroDe(url, `${sanitizeEmail(req.studentEmail)}/`)) {
    return res.status(403).json({ error: 'No tienes acceso a ese documento.' });
  }
  try {
    const signedUrl = await createSignedUrl(url);
    res.json({ signedUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/docs/save', requireStudentAuth, async (req, res) => {
  const email = req.studentEmail;
  const { boleta_url, record_notas_url, record_matricula_url, codigo_estudiante, datos_parseados, force_reparse } = req.body;
  try {
    // 1. Obtener registro existente en Supabase para no perder URLs previas si solo se subió un archivo
    const getRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/documentos_estudiante?email=eq.${encodeURIComponent(email)}&limit=1`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
    });
    let existing = {};
    if (getRes.ok) {
      const existingData = await getRes.json();
      if (existingData && existingData.length > 0) {
        existing = existingData[0];
      }
    }

    const finalBoleta = boleta_url || existing.boleta_url;
    const finalAvance = record_notas_url || existing.record_notas_url;
    const finalFicha = record_matricula_url || existing.record_matricula_url;
    
    let finalDatosParseados = datos_parseados || existing.datos_parseados || {};
    let finalCodigo = codigo_estudiante || existing.codigo_estudiante;
    let finalDatosAcademicos = existing.datos_academicos || {};

    // El parseo ya no ocurre aquí. Antes esta ruta extraía los datos de los
    // PDF en cada subida de estudiante, así que 200 alumnos matriculándose a la
    // vez eran 200 extracciones bloqueando el único hilo de Node, y además
    // reparseaba lo que el navegador ya había parseado. Ahora la ruta solo
    // guarda las rutas de los archivos: la extracción la dispara un admin
    // desde el panel con /api/admin/estudiantes/:email/parsear.
    //
    // Se conserva datos_parseados que llegue en el cuerpo por compatibilidad
    // con lo ya guardado, pero el servidor no lo genera.

    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/documentos_estudiante?on_conflict=email`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        email,
        boleta_url: finalBoleta || null,
        record_notas_url: finalAvance || null,
        record_matricula_url: finalFicha || null,
        codigo_estudiante: finalCodigo || null,
        datos_parseados: finalDatosParseados,
        codigo: finalCodigo || null,
        urls: { ficha: finalFicha || null, boleta: finalBoleta || null, avance: finalAvance || null },
        datos_academicos: finalDatosAcademicos,
        updated_at: new Date().toISOString()
      })
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    res.json({ success: true, datos_parseados: finalDatosParseados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/docs/:email', requireStudentAuth, async (req, res) => {
  const email = req.studentEmail;
  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/documentos_estudiante?email=eq.${encodeURIComponent(email)}&limit=1`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
    });
    const data = await r.json();
    res.json(data[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const DOC_FIELD_BY_TIPO = {
  ficha: 'record_matricula_url',
  boleta: 'boleta_url',
  avance: 'record_notas_url',
};

app.delete('/api/docs/:email/:tipo', requireStudentAuth, async (req, res) => {
  const email = req.studentEmail;
  const field = DOC_FIELD_BY_TIPO[req.params.tipo];
  if (!field) return res.status(400).json({ error: 'Tipo de documento inválido' });
  try {
    const getRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/documentos_estudiante?email=eq.${encodeURIComponent(email)}&limit=1`, {
      headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }
    });
    const existingData = await getRes.json();
    const existing = existingData?.[0];
    const storedUrl = existing?.[field];
    if (!storedUrl) return res.status(404).json({ error: 'No hay documento guardado para borrar' });

    await deleteStorageFile(storedUrl);

    const patchRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/documentos_estudiante?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ [field]: null, updated_at: new Date().toISOString() })
    });
    if (!patchRes.ok) { const t = await patchRes.text(); return res.status(500).json({ error: t }); }

    logActividad({ actorEmail: email, actorType: 'estudiante', accion: 'documento_eliminado', detalle: { tipo: req.params.tipo } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const DOCS_BUCKET = 'Documentos Tefiis';

// ── Evidencias de un reclamo ────────────────────────────────────────────────
// Archivos opcionales que el estudiante adjunta como prueba (capturas, cartas,
// resoluciones). Van al mismo bucket privado que sus documentos académicos y
// bajo su propia carpeta, de modo que la comprobación de propiedad que ya hace
// /api/docs/signed-url —el path tiene que empezar por su correo saneado— vale
// igual para estas y un estudiante no puede firmar las de otro.
// Una sola prueba y en PDF. Antes se admitían hasta 5 archivos y fotos sueltas,
// que llegaban como capturas de móvil difíciles de leer y desordenadas. Un PDF
// obliga al estudiante a juntar lo que quiera probar en un solo documento.
const MAX_EVIDENCIAS = 1;
const MAX_EVIDENCIA_BYTES = 10 * 1024 * 1024;   // 10 MB

// Los reclamos anteriores pueden tener imágenes guardadas y se siguen mostrando
// y descargando sin problema: esto solo restringe lo que se acepta de ahora en
// adelante.
const TIPOS_EVIDENCIA = {
  'application/pdf': 'pdf',
};

const MENSAJE_TIPO_EVIDENCIA = 'Solo se acepta un archivo PDF como prueba.';

const uploadEvidencia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCIA_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!TIPOS_EVIDENCIA[file.mimetype]) return cb(errorTipoArchivo(MENSAJE_TIPO_EVIDENCIA));
    cb(null, true);
  },
});

const carpetaEvidencias = (email) => `${sanitizeEmail(email)}/evidencias/`;

// Una referencia solo es válida si apunta a la carpeta de evidencias del propio
// estudiante. Se comprueba en el servidor y no en el cliente: el navegador manda
// las referencias al crear el reclamo y podría mandar cualquier cosa.
// startsWith por sí solo NO basta: "mi_correo/../otro_correo/ficha.pdf" empieza
// por mi carpeta y Supabase resuelve el ".." antes de servir el objeto, así que
// firmaba y entregaba el archivo del otro. Se rechaza cualquier segmento "." o
// ".." y se exige que el bucket sea el de documentos, no uno cualquiera que
// venga en la URL.
function rutaDentroDe(storedUrl, prefijo) {
  if (typeof storedUrl !== 'string') return false;
  const partes = parseStorageRef(storedUrl);
  if (!partes || partes.bucket !== DOCS_BUCKET) return false;
  const segmentos = partes.path.split('/');
  if (segmentos.some((seg) => seg === '..' || seg === '.' || seg === '')) return false;
  return partes.path.startsWith(prefijo);
}

function esEvidenciaPropia(ref, email) {
  return rutaDentroDe(ref, carpetaEvidencias(email));
}

app.post('/api/reclamos/evidencias', requireStudentAuth, limiteSubidas, marcarLimite(MAX_EVIDENCIA_BYTES), uploadEvidencia.single('file'), async (req, res) => {
  // El corte va aquí y no antes de multer a propósito: rechazar antes de que el
  // cuerpo se haya consumido corta la conexión a media subida, y el navegador
  // del móvil enseña "Failed to fetch" en vez del motivo. Dejando que el
  // archivo llegue y descartándolo, el estudiante lee por qué no se guardó.
  if (await despedidaActivaPara(req.studentEmail)) {
    return res.status(503).json({ error: 'El proceso de matrícula ha terminado. Nos vemos el siguiente ciclo.' });
  }
  if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' });
  const email = req.studentEmail;
  const extension = TIPOS_EVIDENCIA[req.file.mimetype];

  try {
    // Nombre propio y opaco: el original puede traer acentos, barras o repetirse
    // entre archivos y pisaría al anterior. El nombre visible viaja aparte.
    const id = `${Date.now()}-${randomInt(0, 1e9).toString(36)}`;
    const objectPath = `${carpetaEvidencias(email)}${id}.${extension}`;

    const subida = await fetch(
      `${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(DOCS_BUCKET)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': req.file.mimetype,
          'x-upsert': 'true',
        },
        body: req.file.buffer,
      },
    );
    if (!subida.ok) { const t = await subida.text(); return res.status(500).json({ error: t }); }

    const ref = `${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(DOCS_BUCKET)}/${objectPath}`;

    logActividad({ actorEmail: email, actorType: 'estudiante', accion: 'evidencia_subida', detalle: { archivo: req.file.originalname, bytes: req.file.size } });

    res.json({
      success: true,
      evidencia: {
        ref,
        nombre: req.file.originalname.slice(0, 120),
        tipo: req.file.mimetype,
        bytes: req.file.size,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Quitar una evidencia antes de enviar el reclamo (o después de un error).
app.delete('/api/reclamos/evidencias', requireStudentAuth, async (req, res) => {
  const { ref } = req.query;
  if (!esEvidenciaPropia(ref, req.studentEmail)) {
    return res.status(403).json({ error: 'No tienes acceso a ese archivo.' });
  }
  try {
    await deleteStorageFile(ref);
    logActividad({ actorEmail: req.studentEmail, actorType: 'estudiante', accion: 'evidencia_eliminada', detalle: {} });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
  fileFilter: soloPdf,
});

// Sube el PDF directo a Storage con la service key (evita RLS) y actualiza
// la columna correspondiente en documentos_estudiante.
app.post('/api/docs/upload', requireStudentAuth, limiteSubidas, marcarLimite(MAX_PDF_BYTES), uploadMemory.single('file'), async (req, res) => {
  // Igual que en las evidencias: después de multer, para que el error llegue
  // legible en vez de como una conexión cortada. Sin esto, una pestaña abierta
  // desde antes del cierre pisaría los PDF buenos del estudiante con otros
  // nuevos que ya no van a servir para ningún reclamo.
  if (await despedidaActivaPara(req.studentEmail)) {
    return res.status(503).json({ error: 'El proceso de matrícula ha terminado. Nos vemos el siguiente ciclo.' });
  }
  const email = req.studentEmail;
  const { tipo } = req.body;
  const field = DOC_FIELD_BY_TIPO[tipo];
  if (!field) return res.status(400).json({ error: 'Tipo de documento inválido' });
  if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' });

  try {
    const sid = sanitizeEmail(email);
    const objectPath = `${sid}/${tipo}.pdf`;

    const uploadRes = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(DOCS_BUCKET)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: req.file.buffer,
    });
    if (!uploadRes.ok) { const t = await uploadRes.text(); return res.status(500).json({ error: t }); }

    const url = `${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(DOCS_BUCKET)}/${objectPath}`;

    const patchRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/documentos_estudiante?on_conflict=email`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ email, [field]: url, updated_at: new Date().toISOString() })
    });
    if (!patchRes.ok) { const t = await patchRes.text(); return res.status(500).json({ error: t }); }

    logActividad({ actorEmail: email, actorType: 'estudiante', accion: 'documento_subido', detalle: { tipo, archivo: req.file.originalname } });
    res.json({ success: true, url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// CHAT: GUARDAR HISTORIAL
// ==========================================
app.post('/api/chat/save', requireStudentAuth, async (req, res) => {
  const email = req.studentEmail;
  const { pregunta, respuesta } = req.body;
  if (!pregunta || !respuesta) {
    return res.status(400).json({ error: 'Faltan campos' });
  }
  try {
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_KEY;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': sbKey,
      'Authorization': `Bearer ${sbKey}`,
      'Prefer': 'return=minimal'
    };
    const r = await fetch(`${sbUrl}/rest/v1/chat_historial`, {
      method: 'POST',
      headers,
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

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// ==========================================
// INTERRUPTOR DE RECLAMOS — cierra la ventana de reclamos para los estudiantes
// ==========================================
// Se consulta en cada creación de reclamo, así que se cachea: con 200 alumnos
// enviando a la vez, leerlo de Supabase por petición añade 200 viajes que
// siempre devuelven lo mismo. 10 s basta para que apagarlo se note enseguida.
let cacheReclamos = { valor: null, hasta: 0 };
const TTL_INTERRUPTOR = 10_000;

async function reclamosHabilitados() {
  if (cacheReclamos.valor !== null && Date.now() < cacheReclamos.hasta) return cacheReclamos.valor;
  try {
    const r = await sbRest('/app_settings?key=eq.reclamos_habilitados&select=value');
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    // Sin fila configurada, la ventana está abierta: es el estado normal y no
    // se puede exigir un paso manual en Supabase para que el sistema funcione.
    const valor = rows[0]?.value !== false;
    cacheReclamos = { valor, hasta: Date.now() + TTL_INTERRUPTOR };
    return valor;
  } catch (err) {
    // Si Supabase falla se deja pasar. Bloquear a los 200 por un fallo de
    // lectura hace más daño que dejar entrar algún reclamo de más, que el
    // admin ve y puede tratar.
    console.error('No se pudo leer el interruptor de reclamos:', err.message);
    return true;
  }
}

// Con la ventana cerrada, el administrador principal sigue pudiendo enviar
// reclamos para probar el flujo de punta a punta sin abrirla para todos. El
// correo se compara contra el del JWT firmado, nunca contra uno que venga en el
// cuerpo, y la excepción vive en el código —no en la base ni en una variable de
// entorno— para que cambiarla exija un despliegue y quede en el historial.
async function puedeEnviarReclamo(email) {
  if (await reclamosHabilitados()) return true;
  return String(email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
}

// Pública a propósito: el frontend la consulta antes de mostrar el formulario.
// Si viene una sesión válida, la respuesta se personaliza; sin ella se informa
// del estado general, que es lo que corresponde a un visitante sin identificar.
app.get('/api/reclamos-habilitados', async (req, res) => {
  res.json({ habilitados: await puedeEnviarReclamo(emailDeSesionOpcional(req)) });
});

app.post('/api/admin/reclamos-habilitados', requireAdminAuth, async (req, res) => {
  if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Solo el administrador principal puede abrir o cerrar la ventana de reclamos.' });
  }
  const { habilitados } = req.body;
  if (typeof habilitados !== 'boolean') return res.status(400).json({ error: 'El campo "habilitados" debe ser true o false.' });
  try {
    // Upsert: la fila puede no existir todavía y no se va a pedir un paso
    // manual en Supabase para poder usar el interruptor la primera vez.
    const r = await sbRest('/app_settings', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'reclamos_habilitados', value: habilitados, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    cacheReclamos = { valor: habilitados, hasta: Date.now() + TTL_INTERRUPTOR };
    logActividad({
      actorEmail: req.adminEmail, actorType: 'admin',
      accion: habilitados ? 'reclamos_habilitados' : 'reclamos_deshabilitados',
    });
    res.json({ success: true, habilitados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// MODO ALMUERZO — pausa solo las consultas a Tefi
// ==========================================
// A diferencia del mantenimiento, esto NO apaga la plataforma: los reclamos
// siguen funcionando con normalidad y es a donde se redirige al estudiante.
// Solo se cierra la conversación, que es lo que consume cuota de Gemini.
// Se consulta en cada pregunta a Tefi, así que se cachea igual que el
// interruptor de reclamos: sin esto, cada consulta añade un viaje a Supabase
// que siempre devuelve lo mismo. 10 s basta para que encenderlo se note.
let cacheAlmuerzo = { valor: null, hasta: 0 };

async function modoAlmuerzoActivo() {
  if (cacheAlmuerzo.valor !== null && Date.now() < cacheAlmuerzo.hasta) return cacheAlmuerzo.valor;
  try {
    const r = await sbRest('/app_settings?key=eq.modo_almuerzo&select=value');
    if (!r.ok) throw new Error(await r.text());
    const filas = await r.json();
    const valor = filas[0]?.value === true;
    cacheAlmuerzo = { valor, hasta: Date.now() + TTL_INTERRUPTOR };
    return valor;
  } catch (err) {
    // Ante un fallo se responde que no está activo: dejar el chat abierto de
    // más es mucho menos grave que cerrarlo por un error de lectura.
    console.error('No se pudo leer el modo almuerzo:', err.message);
    return false;
  }
}

app.get('/api/modo-almuerzo', async (req, res) => {
  res.json({ activo: await modoAlmuerzoActivo() });
});

app.post('/api/admin/modo-almuerzo', requireAdminAuth, async (req, res) => {
  if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Solo el administrador principal puede activar el modo almuerzo.' });
  }
  const { activo } = req.body;
  if (typeof activo !== 'boolean') return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
  try {
    // Upsert: la fila puede no existir todavía y no se va a pedir un paso
    // manual en Supabase para poder usar el interruptor la primera vez.
    const r = await sbRest('/app_settings', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'modo_almuerzo', value: activo, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    cacheAlmuerzo = { valor: activo, hasta: Date.now() + TTL_INTERRUPTOR };
    logActividad({
      actorEmail: req.adminEmail, actorType: 'admin',
      accion: activo ? 'modo_almuerzo_activado' : 'modo_almuerzo_desactivado',
    });
    res.json({ success: true, activo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// MODO ALMUERZO FESTIVO — igual que el almuerzo normal, pero para feriados
// ==========================================
// Interruptor independiente del modo almuerzo de todos los días: los dos
// pueden convivir sin pisarse, cada uno con su propia fila en app_settings.
let cacheAlmuerzoFestivo = { valor: null, hasta: 0 };

async function modoAlmuerzoFestivoActivo() {
  if (cacheAlmuerzoFestivo.valor !== null && Date.now() < cacheAlmuerzoFestivo.hasta) return cacheAlmuerzoFestivo.valor;
  try {
    const r = await sbRest('/app_settings?key=eq.modo_almuerzo_festivo&select=value');
    if (!r.ok) throw new Error(await r.text());
    const filas = await r.json();
    const valor = filas[0]?.value === true;
    cacheAlmuerzoFestivo = { valor, hasta: Date.now() + TTL_INTERRUPTOR };
    return valor;
  } catch (err) {
    console.error('No se pudo leer el modo almuerzo festivo:', err.message);
    return false;
  }
}

app.get('/api/modo-almuerzo-festivo', async (req, res) => {
  res.json({ activo: await modoAlmuerzoFestivoActivo() });
});

app.post('/api/admin/modo-almuerzo-festivo', requireAdminAuth, async (req, res) => {
  if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Solo el administrador principal puede activar el modo almuerzo festivo.' });
  }
  const { activo } = req.body;
  if (typeof activo !== 'boolean') return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
  try {
    const r = await sbRest('/app_settings', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'modo_almuerzo_festivo', value: activo, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    cacheAlmuerzoFestivo = { valor: activo, hasta: Date.now() + TTL_INTERRUPTOR };
    logActividad({
      actorEmail: req.adminEmail, actorType: 'admin',
      accion: activo ? 'modo_almuerzo_festivo_activado' : 'modo_almuerzo_festivo_desactivado',
    });
    res.json({ success: true, activo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// MODO MANTENIMIENTO — pausa sistema-tefiis para todos los estudiantes
// ==========================================
// Pública y sin auth a propósito: la consulta el frontend de sistema-tefiis
// para TODOS los visitantes, incluso antes de iniciar sesión.
app.get('/api/maintenance', async (req, res) => {
  try {
    const r = await sbRest('/app_settings?key=eq.maintenance_mode&select=value');
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    const rows = await r.json();
    res.json({ enabled: rows[0]?.value === true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/maintenance', requireAdminAuth, async (req, res) => {
  if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Solo el administrador principal puede activar el modo mantenimiento.' });
  }
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'El campo "enabled" debe ser true o false.' });
  try {
    const r = await sbRest('/app_settings?key=eq.maintenance_mode', {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ value: enabled, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    logActividad({ actorEmail: req.adminEmail, actorType: 'admin', accion: enabled ? 'mantenimiento_activado' : 'mantenimiento_desactivado' });
    res.json({ success: true, enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// MODO "TEFI DURMIENDO" — pausa sistema-tefiis para todos los estudiantes
// ==========================================
// Independiente del modo mantenimiento: comparten el mismo efecto (bloquear
// toda la app) pero distinto propósito y distinta clave en app_settings, así
// que se pueden activar o desactivar sin que uno pise al otro. Manual, sin
// horario automático: el propio texto menciona un horario de descanso, pero
// eso es solo el mensaje al estudiante, no una condición que el servidor
// evalúe.
// Se cachea igual que los otros interruptores: se consulta en cada reclamo
// y sin caché serían tantos viajes a Supabase como envíos.
let cacheTefiDurmiendo = { valor: null, hasta: 0 };

async function tefiDurmiendoActivo() {
  if (cacheTefiDurmiendo.valor !== null && Date.now() < cacheTefiDurmiendo.hasta) return cacheTefiDurmiendo.valor;
  try {
    const r = await sbRest('/app_settings?key=eq.tefi_durmiendo&select=value');
    if (!r.ok) throw new Error(await r.text());
    const filas = await r.json();
    const valor = filas[0]?.value === true;
    cacheTefiDurmiendo = { valor, hasta: Date.now() + TTL_INTERRUPTOR };
    return valor;
  } catch (err) {
    // Ante un fallo se deja enviar: bloquear todos los reclamos por un error de
    // lectura sería peor que dejar pasar alguno de más con el modo activo.
    console.error('No se pudo leer el modo tefi_durmiendo:', err.message);
    return false;
  }
}

app.get('/api/tefi-durmiendo', async (req, res) => {
  res.json({ enabled: await tefiDurmiendoActivo() });
});

app.post('/api/admin/tefi-durmiendo', requireAdminAuth, async (req, res) => {
  if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Solo el administrador principal puede activar el modo Tefi durmiendo.' });
  }
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'El campo "enabled" debe ser true o false.' });
  try {
    const r = await sbRest('/app_settings', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'tefi_durmiendo', value: enabled, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    cacheTefiDurmiendo = { valor: enabled, hasta: Date.now() + TTL_INTERRUPTOR };
    logActividad({ actorEmail: req.adminEmail, actorType: 'admin', accion: enabled ? 'tefi_durmiendo_activado' : 'tefi_durmiendo_desactivado' });
    res.json({ success: true, enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// MODO DESPEDIDA — el ciclo de matrícula terminó
// ==========================================
// No es el modo mantenimiento ni Tefi durmiendo: aquéllos son pausas y se
// espera que la plataforma vuelva. Éste es el cierre del ciclo, así que la
// pantalla se despide y los reclamos quedan cerrados hasta el ciclo siguiente.
// Clave propia en app_settings para poder combinarlo con los otros sin que se
// pisen, y cacheado igual que ellos porque se consulta en cada envío.
let cacheDespedida = { valor: null, hasta: 0 };

// Cerrado el ciclo, estos correos siguen pudiendo presentar su reclamo. Igual
// que CORREOS_EXCEPCION y por el mismo motivo: vive en el código, no en la base
// ni en una variable de entorno, así que abrir la mano exige un despliegue y
// queda en el historial de git, con fecha y autor.
// Siempre en minúsculas: la búsqueda normaliza lo que llega, así que una
// entrada con mayúsculas aquí no coincidiría nunca.
const EXCEPCIONES_DESPEDIDA = new Set([
  'alvaro.coronel.t@uni.pe',
  'marcelo.rumiche.r@uni.pe',
]);

// El cierre se evalúa POR PERSONA, no solo de forma global. Sin esto, abrirle el
// candado del servidor no serviría de nada: seguiría viendo la pantalla de
// despedida y no llegaría ni al formulario.
async function despedidaActivaPara(email) {
  if (!(await modoDespedidaActivo())) return false;
  return !EXCEPCIONES_DESPEDIDA.has(String(email || '').trim().toLowerCase());
}

async function modoDespedidaActivo() {
  if (cacheDespedida.valor !== null && Date.now() < cacheDespedida.hasta) return cacheDespedida.valor;
  try {
    const r = await sbRest('/app_settings?key=eq.modo_despedida&select=value');
    if (!r.ok) throw new Error(await r.text());
    const filas = await r.json();
    const valor = filas[0]?.value === true;
    cacheDespedida = { valor, hasta: Date.now() + TTL_INTERRUPTOR };
    return valor;
  } catch (err) {
    // Como en los demás interruptores: ante un fallo de lectura se deja pasar.
    // Cerrar la matrícula entera por un error de red sería mucho peor que dejar
    // entrar algún reclamo de más, que el admin ve y puede tratar.
    console.error('No se pudo leer el modo despedida:', err.message);
    return false;
  }
}

// Pública: el frontend la consulta al cargar para saber si muestra la
// despedida en vez del menú normal.
app.get('/api/modo-despedida', async (req, res) => {
  res.json({ activo: await despedidaActivaPara(emailDeSesionOpcional(req)) });
});

app.post('/api/admin/modo-despedida', requireAdminAuth, async (req, res) => {
  if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Solo el administrador principal puede cerrar el ciclo.' });
  }
  const { activo } = req.body;
  if (typeof activo !== 'boolean') return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
  try {
    const r = await sbRest('/app_settings', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'modo_despedida', value: activo, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    cacheDespedida = { valor: activo, hasta: Date.now() + TTL_INTERRUPTOR };
    logActividad({ actorEmail: req.adminEmail, actorType: 'admin', accion: activo ? 'modo_despedida_activado' : 'modo_despedida_desactivado' });
    res.json({ success: true, activo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Quién ha atendido cada reclamo. Se deriva del log de actividad, que ya
// registra cada cambio de estado y cada respuesta con su autor: no hace falta
// guardar nada aparte, no hay que mantener dos fuentes sincronizadas, y sale
// gratis para todo lo ya hecho.
//
// A diferencia del historial completo, esto lo puede ver cualquier admin: solo
// dice qué compañero tocó qué caso, que es justo lo que necesitan para no
// pisarse. El historial entero sigue restringido porque lleva mucho más.
app.get('/api/admin/reclamos-atendidos', requireAdminAuth, async (req, res) => {
  try {
    const traido = await sbRestTodo('/activity_log?select=actor_email,accion,detalle,created_at&actor_type=eq.admin&accion=in.(reclamo_actualizado,reclamo_respondido)&order=created_at.asc');
    if (!traido.ok) { const t = await traido.respuesta.text(); return res.status(500).json({ error: t }); }
    const porCaso = {};
    // Se manda cada acción, no solo la primera de cada persona: la columna
    // necesita saber quién tocó el caso, pero al hacer clic en el apodo se
    // quiere ver qué hizo y a qué hora, y eso puede pasar varias veces.
    for (const fila of traido.filas) {
      const caso = fila?.detalle?.caseId;
      if (!caso || !fila.actor_email) continue;
      (porCaso[caso] = porCaso[caso] || []).push({
        email: fila.actor_email,
        accion: fila.accion,
        estado: fila.detalle?.estado || null,
        fecha: fila.created_at,
      });
    }
    res.json(porCaso);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// HISTORIAL DE ACTIVIDAD — solo admin principal
// ==========================================
app.get('/api/admin/activity', requireAdminAuth, async (req, res) => {
  if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Solo el administrador principal puede ver el historial.' });
  }
  try {
    const r = await sbRest('/activity_log?select=*&order=created_at.desc&limit=500');
    if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manejador final de errores. Sin esto, un PDF que pasa del límite o un archivo
// que no es PDF revientan con un 500 y un stack en el log, en vez de decirle al
// alumno qué pasó. También evita filtrar detalles internos en la respuesta.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
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
