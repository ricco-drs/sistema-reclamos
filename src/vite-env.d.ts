/// <reference types="vite/client" />

// ── Variables de entorno expuestas al NAVEGADOR ─────────────────────────────
// Vite incrusta el valor de toda variable VITE_* dentro del bundle público, así
// que declarar una aquí equivale a publicarla. Solo va la URL del backend.
//
// NO declares ni leas desde el cliente ninguna credencial (Supabase, Gemini,
// Firebase service account, JWT_SECRET): esas viven en process.env del backend.
// Ojo con VITE_API_KEY del .env — pese al prefijo, es la clave de Gemini y solo
// la usa el servidor. Si alguien la lee desde src/ acaba publicada.
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
