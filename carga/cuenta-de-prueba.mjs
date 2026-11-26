// Se carga antes que la API (node --import), solo en el Compose de medición.
//
// firebase-admin exige una cuenta de servicio con una clave privada válida,
// aunque con FIREBASE_AUTH_EMULATOR_HOST nunca la usa: los tokens del emulador
// no van firmados y la API los comprueba contra el emulador. Por eso la clave se
// genera aquí, desechable, en cada arranque: no hay ningún secreto en el
// repositorio ni en el .env.
import { generateKeyPairSync } from 'node:crypto';

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('cuenta-de-prueba.mjs solo se usa con el emulador de Firebase (FIREBASE_AUTH_EMULATOR_HOST).');
}

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

// El proyecto tiene que ser el mismo con el que arranca el emulador
// (carga/emulador-auth/Dockerfile): los tokens llevan ese proyecto en aud e iss.
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'demo-tefiis',
  client_email: 'medicion@demo-tefiis.iam.gserviceaccount.com',
  private_key: privateKey,
});
