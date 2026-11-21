// Genera los tokens de estudiante para la prueba de carga (E1) y la de
// autorización (E3), sin pasar por el código de 4 dígitos ni por el correo.
//
// La sesión del estudiante es un JWT que firma la propia API con JWT_SECRET
// (backend/server.js, POST /api/auth/verify-code), y requireStudentAuth solo
// comprueba la firma y el vencimiento. Firmados con el mismo secreto que usa la
// API de Compose, estos tokens valen igual que uno obtenido desde la interfaz.
//
// Uso, desde sistema-reclamos/:
//   node --env-file=<.env de Compose> pruebas/generar-tokens.js
//   JWT_SECRET=<secreto de Compose> node pruebas/generar-tokens.js --cantidad 200
//
// El secreto no se lee del .env del proyecto a propósito: ese archivo suele
// tener el de producción, y 200 sesiones válidas en producción es justo lo que
// no hay que fabricar por accidente.
//
// Escribe pruebas/tokens.json (git lo ignora) con:
//   validos      una sesión por estudiante; vencen en 24 h, como las reales,
//                así que la prueba tiene que correr dentro de ese plazo.
//   vencido      firmado con el secreto correcto, pero venció hace una hora.
//   falsificado  el mismo formato, firmado con otro secreto.
// El caso «sin token» de E3 no necesita nada: basta no mandar Authorization.
//
// En k6:
//   const tokens = new SharedArray('tokens', () => JSON.parse(open('./tokens.json')).validos);

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import jwt from 'jsonwebtoken';

const DIRECTORIO = path.dirname(fileURLToPath(import.meta.url));

// La misma vigencia que da la API al verificar el código.
const VIGENCIA = '24h';

// Dominio reservado para pruebas (RFC 2606): ningún correo a estas direcciones
// llega a un buzón real, aunque en el entorno quede un proveedor configurado.
const DOMINIO = 'prueba.test';

function fallar(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

const { values: opciones } = parseArgs({
  options: {
    cantidad: { type: 'string', default: '200' },
    salida: { type: 'string', default: path.join(DIRECTORIO, 'tokens.json') },
  },
});

// Al menos dos: E3 necesita un estudiante que pida el reclamo de otro.
const cantidad = Number(opciones.cantidad);
if (!Number.isInteger(cantidad) || cantidad < 2) {
  fallar('--cantidad tiene que ser un número entero mayor o igual que 2.');
}

const secreto = process.env.JWT_SECRET;
if (!secreto) {
  fallar('Falta JWT_SECRET. Usa el mismo secreto que la API de Compose, por ejemplo:\n'
    + '  node --env-file=<.env de Compose> pruebas/generar-tokens.js');
}

const ancho = Math.max(3, String(cantidad).length);
const correo = (n) => `estudiante-${String(n).padStart(ancho, '0')}@${DOMINIO}`;

const validos = Array.from({ length: cantidad }, (_, i) => {
  const email = correo(i + 1);
  return { email, token: jwt.sign({ email }, secreto, { expiresIn: VIGENCIA }) };
});

// Los dos tokens inválidos llevan el correo de un estudiante que sí tiene una
// sesión válida: así, si la API los rechaza, es por el token y no porque no
// conozca el correo.
const email = validos[0].email;
const ahora = Math.floor(Date.now() / 1000);
const vencido = {
  email,
  token: jwt.sign({ email, iat: ahora - 2 * 3600, exp: ahora - 3600 }, secreto),
};
// Otro secreto, distinto en cada corrida, para que no pueda coincidir con el de la API.
const falsificado = {
  email,
  token: jwt.sign({ email }, crypto.randomBytes(32).toString('hex'), { expiresIn: VIGENCIA }),
};

// La misma comprobación que hace requireStudentAuth. Si algo no cuadra aquí,
// la API tampoco se comportaría como espera la prueba.
const correoAceptado = (token) => {
  try {
    return jwt.verify(token, secreto).email;
  } catch {
    return null;
  }
};
const rechazados = validos.filter((v) => correoAceptado(v.token) !== v.email);
if (rechazados.length) fallar(`${rechazados.length} tokens válidos no pasan la verificación.`);
if (correoAceptado(vencido.token) !== null) fallar('El token vencido pasa la verificación.');
if (correoAceptado(falsificado.token) !== null) fallar('El token falsificado pasa la verificación.');

const vencenEn = new Date(jwt.decode(validos[0].token).exp * 1000).toISOString();
const salida = path.resolve(opciones.salida);
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, `${JSON.stringify({
  generadoEn: new Date(ahora * 1000).toISOString(),
  vencenEn,
  validos,
  vencido,
  falsificado,
}, null, 2)}\n`);

console.log(`${cantidad} tokens válidos, 1 vencido y 1 falsificado en ${path.relative(process.cwd(), salida)}.`);
console.log(`Los válidos vencen el ${vencenEn}.`);
