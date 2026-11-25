// Experimento antes y después de resiliencia (Timeout + Circuit Breaker opossum) en Docker Compose.
// Envía N registros reales contra POST /api/reclamos con avisos: "api" y lee los intentos reales
// registrados en el simulador HTTP de correo y M2 (compose.eventos.yaml).
//
// Uso dentro del contenedor `api`:
//   node scripts/probar-resiliencia-compose.mjs [cantidad=10] [proveedorEsperado=resend] [codigoM2=502]

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as esperar } from 'node:timers/promises';
import jwt from 'jsonwebtoken';

const api = 'http://127.0.0.1:3005';
const simuladores = 'http://simuladores:8081';
const cantidad = Number(process.argv[2] || 10);
const proveedorEsperado = process.argv[3] || 'resend';
const codigoM2 = Number(process.argv[4] || 502);
const espaciadoMs = Number(process.argv[5] ?? 600);

assert.equal(process.env.SUPABASE_URL, 'http://rest:8080', 'Ejecuta la prueba dentro del Compose de laboratorio.');
assert.equal(process.env.M2_URL, `${simuladores}/m2`, 'Levanta Compose con compose.eventos.yaml.');

const lote = randomUUID().slice(0, 8);
const correos = Array.from({ length: cantidad }, (_, i) => `resiliencia-${lote}-${String(i + 1).padStart(2, '0')}@prueba.test`);

async function leerEventosLote() {
  const res = await fetch(`${simuladores}/eventos`, { signal: AbortSignal.timeout(2000) });
  assert.equal(res.status, 200);
  const estado = await res.json();
  const set = new Set(correos);
  return {
    correo: estado.correo.filter((i) => set.has(i.email)),
    expedientes: estado.expedientes.filter(({ expediente }) => set.has(expediente.email)),
  };
}

const t0 = performance.now();
const ids = [];
for (let i = 0; i < correos.length; i++) {
  const email = correos[i];
  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const res = await fetch(`${api}/api/reclamos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nombre: `Estudiante Resiliencia ${i + 1}`,
      codigo_estudiante: `2024${String(i + 1).padStart(4, '0')}A`,
      categoria: 'Matrícula',
      descripcion: `Experimento resiliencia Lab11 lote ${lote} #${i + 1}.`,
      avisos: 'api',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(res.status, 201, `Se esperaba 201 en reclamo ${i + 1}`);
  const body = await res.json();
  assert.equal(body.avisos, 'api');
  ids.push(body.id);
  if (espaciadoMs > 0 && i < correos.length - 1) {
    await esperar(espaciadoMs);
  }
}
const duracionHttpMs = Math.round(performance.now() - t0);

let eventos;
const limite = Date.now() + 30_000;
do {
  eventos = await leerEventosLote();
  const aceptados = eventos.correo.filter((i) => i.resultado === 200).length;
  const pendientes = eventos.correo.filter((i) => i.resultado === 'pendiente').length;
  if (aceptados >= cantidad && pendientes === 0 && eventos.expedientes.length >= cantidad) break;
  await esperar(100);
} while (Date.now() < limite);
const duracionTotalMs = Math.round(performance.now() - t0);

const porProveedor = { brevo: 0, resend: 0, mailjet: 0 };
const aceptadosPorProveedor = { brevo: 0, resend: 0, mailjet: 0 };
for (const intento of eventos.correo) {
  porProveedor[intento.proveedor] = (porProveedor[intento.proveedor] || 0) + 1;
  if (intento.resultado === 200) {
    aceptadosPorProveedor[intento.proveedor] = (aceptadosPorProveedor[intento.proveedor] || 0) + 1;
  }
}

assert.equal(aceptadosPorProveedor[proveedorEsperado], cantidad, `Se esperaban ${cantidad} aceptados por ${proveedorEsperado}`);
assert.equal(eventos.expedientes.length, cantidad);
assert.ok(eventos.expedientes.every((e) => e.status === codigoM2));

console.log(JSON.stringify({
  lote,
  cantidad,
  emailTimeoutMs: process.env.EMAIL_TIMEOUT_MS,
  emailCbEnabled: process.env.EMAIL_CB_ENABLED,
  emailCbVolumeThreshold: process.env.EMAIL_CB_VOLUME_THRESHOLD,
  respuestas201: ids.length,
  duracionHttpMs,
  duracionTotalConConsumidoresMs: duracionTotalMs,
  intentosCorreo: porProveedor,
  aceptadosCorreo: aceptadosPorProveedor,
  expedientesM2: eventos.expedientes.length,
  codigoM2,
}, null, 2));
