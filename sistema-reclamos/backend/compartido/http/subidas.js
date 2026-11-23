import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Ojo con el escenario real: cientos de alumnos pueden entrar desde la misma
// red de la UNI y salir con una sola IP pública. Por eso los límites de las
// rutas autenticadas se cuentan por CORREO (que viene del JWT ya verificado) y
// no por IP — si no, el primer alumno consumiría la cuota de todos.
// ipKeyGenerator normaliza la IP antes de usarla como clave. Con IPv6 crudo el
// límite se evade: cada usuario tiene un /64 entero de direcciones distintas y
// cada una abriría su propia cubeta. El helper las agrupa por subred.
export const claveIp = (req) => ipKeyGenerator(req.ip);
const porCorreo = (req) => req.body?.email?.toLowerCase?.() || claveIp(req);
const porCorreoOIp = (req) => req.studentEmail || porCorreo(req);

export const limiteSubidas = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: porCorreoOIp,
  message: { error: 'Has subido demasiados archivos seguidos. Espera unos minutos.' },
});

// Se marca con un código en vez de reconocer el error por su texto: así se
// puede reescribir el mensaje sin que el manejador deje de identificarlo.
export function errorTipoArchivo(mensaje) {
  const err = new Error(mensaje);
  err.code = 'TIPO_ARCHIVO_NO_PERMITIDO';
  return err;
}

export const MAX_PDF_BYTES = 15 * 1024 * 1024;   // 15 MB

// Cada ruta tiene su propio tope y multer no lo incluye en el error, así que el
// manejador final informaba siempre el de los PDF. Se anota antes de subir.
export const marcarLimite = (bytes) => (req, res, next) => { req.limiteBytes = bytes; next(); };

export function soloPdf(req, file, cb) {
  const esPdf = file.mimetype === 'application/pdf' &&
                /\.pdf$/i.test(file.originalname || '');
  if (!esPdf) return cb(errorTipoArchivo('Solo se aceptan archivos PDF.'));
  cb(null, true);
}
