import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomInt } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { initializeApp as initFirebaseApp, cert as firebaseCert } from 'firebase-admin/app';
import { getAuth as getFirebaseAuth } from 'firebase-admin/auth';
import { claveIp, EMAIL_CODIGO_IMG_URL, emailTemplate } from '@tefiis/compartido';

// Algunas acciones (indexar la base de conocimiento de Tefi, activar el modo
// mantenimiento) afectan a TODOS los estudiantes a la vez, así que se restringen
// al administrador principal en vez de a cualquier cuenta de ADMIN_EMAILS.
export const SUPER_ADMIN_EMAIL = 'ricco.rashuaman.s@uni.pe';

function iniciarFirebase() {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      const firebaseApp = initFirebaseApp({ credential: firebaseCert(serviceAccount) });
      const firebaseAuth = getFirebaseAuth(firebaseApp);
      return (token) => firebaseAuth.verifyIdToken(token);
    } else {
      console.error('FALTA FIREBASE_SERVICE_ACCOUNT en el .env — las rutas /api/admin/* rechazarán todo hasta configurarlo.');
    }
  } catch (err) {
    console.error('FIREBASE_SERVICE_ACCOUNT inválido:', err.message);
  }
  return null;
}

export function crearModuloAcceso({
  sendEmail, logActividad, verificarTokenAdmin = iniciarFirebase(),
}) {
  const rutas = Router();

  const porCorreo = (req) => req.body?.email?.toLowerCase?.() || claveIp(req);

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

  if (!process.env.JWT_SECRET) {
    console.error('FALTA JWT_SECRET en el .env — las rutas de estudiante no van a firmar sesiones válidas.');
  }

  // Verifica el JWT emitido en /api/auth/verify-code y expone el email verificado
  // en req.studentEmail. Las rutas NUNCA deben confiar en un email que venga del
  // body/query del cliente para decidir de quién son los datos — siempre usan este.
  function requireStudentAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sesión requerida. Verifica tu correo primero.', codigo: 'SESION_REQUERIDA' });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.studentEmail = payload.email;
      next();
    } catch {
      return res.status(401).json({ error: 'Sesión inválida o expirada. Verifica tu correo de nuevo.', codigo: 'SESION_INVALIDA' });
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

  // Cualquier cuenta válida del proyecto Firebase pasaría verifyIdToken — eso no
  // basta para decidir "es admin". Solo los correos en esta lista lo son.
  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  if (ADMIN_EMAILS.length === 0) {
    console.error('FALTA ADMIN_EMAILS en el .env — las rutas /api/admin/* rechazarán todo hasta configurarlo.');
  }

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
    if (!verificarTokenAdmin) return res.status(500).json({ error: 'Autenticación de admin no configurada en el servidor.' });
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Sesión de admin requerida.' });
    try {
      const decoded = await verificarTokenAdmin(token);
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

  // Códigos de verificación en memoria: email → { code, expiresAt }
  const codesStore = new Map();

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

  rutas.post('/api/auth/send-code', limiteEnvioCodigo, async (req, res) => {
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

  rutas.post('/api/auth/verify-code', limiteVerificacion, (req, res) => {
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

  return { rutas, requireStudentAuth, requireAdminAuth, emailDeSesionOpcional, limiteEnvioCodigo };
}
