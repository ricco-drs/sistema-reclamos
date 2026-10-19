import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";

// La configuración sale de sistema-admin/.env (ver .env.example), igual que el
// resto del proyecto. No es secreta: Vite la incluye en el JavaScript que recibe
// el navegador, y Google la diseñó para ser pública. Lo que protege los datos es
// el backend, que verifica el token de Firebase y exige que el correo esté en
// ADMIN_EMAILS (requireAdminAuth en sistema-reclamos/backend/server.js).
const env = import.meta.env;

const obligatorias = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
];
const faltantes = obligatorias.filter((nombre) => !env[nombre]);
if (faltantes.length > 0) {
  throw new Error(
    `Falta la configuración de Firebase (${faltantes.join(", ")}). ` +
    "Copia sistema-admin/.env.example a sistema-admin/.env y complétalo."
  );
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
// Analytics es opcional: sin VITE_FIREBASE_MEASUREMENT_ID el panel funciona igual.
const analytics =
  typeof window !== "undefined" && firebaseConfig.measurementId ? getAnalytics(app) : null;
const auth = getAuth(app);

export { app, analytics, auth };
