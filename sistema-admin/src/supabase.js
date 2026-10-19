// Este módulo NO habla con Supabase: solo arma la ruta de un documento dentro
// del bucket privado. La clave de Supabase jamás debe llegar al navegador —
// todo acceso a datos y a archivos pasa por el backend, que usa la service key.
// Si algún día necesitas leer datos desde aquí, agrega un endpoint al backend.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// christopher.albino.s@uni.pe → christopher_albino_s_at_uni_pe
// Debe coincidir exactamente con sanitizeEmail() del backend.
const sanitizeEmail = (email) =>
  email.toLowerCase().replace('@', '_at_').replace(/\./g, '_');

// Referencia al documento dentro del bucket privado "Documentos Tefiis".
// No es descargable por sí sola: el backend la convierte en una signed URL
// de corta vida tras verificar que quien pide es admin (o el propio dueño).
export const storageUrl = (email, tipo) => {
  const folder = sanitizeEmail(email);
  return `${SUPABASE_URL}/storage/v1/object/Documentos%20Tefiis/${folder}/${tipo}.pdf`;
};
