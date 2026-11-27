// Entrada pública de compartido (docs/particiones.md): piezas técnicas, sin reglas de
// negocio, que usan los módulos y server.js. Lo que no se exporta aquí es interno, y la
// regla `entrada-publica-de-compartido` impide importarlo por su ruta.
export {
  crearEnviadorCorreo, URL_BREVO_DEFAULT, URL_RESEND_DEFAULT, URL_MAILJET_DEFAULT,
} from './correo/enviadorCorreo.js';
export {
  emailTemplate, escaparHtml, EMAIL_CODIGO_IMG_URL, EMAIL_RECLAMO_IMG_URL,
} from './correo/plantillaCorreo.js';
export { crearBusEnProceso } from './eventos/busEnProceso.js';
export { crearPublicadorMemoria } from './eventos/publicadorMemoria.js';
export { respuestaDeCuerpoInvalido, MENSAJE_CUERPO_INVALIDO } from './http/cuerpoInvalido.js';
export { sbRest, sbRestTodo } from './supabase/postgrest.js';
export { logActividad } from './supabase/actividad.js';
export {
  parseStorageRef, deleteStorageFile, createSignedUrl, referenciaDeArchivo, subirArchivo,
} from './supabase/almacenamiento.js';
export {
  claveIp, limiteSubidas, MAX_PDF_BYTES, marcarLimite, soloPdf, errorTipoArchivo,
} from './http/subidas.js';
