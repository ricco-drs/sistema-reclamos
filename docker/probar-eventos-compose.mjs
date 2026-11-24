import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';
import jwt from 'jsonwebtoken';

const api = 'http://127.0.0.1:3005';
const simuladores = 'http://simuladores:8081';
const [proveedorEsperado = 'brevo', codigoM2 = '200'] = process.argv.slice(2);
const proveedores = ['brevo', 'resend', 'mailjet'];
const ultimoProveedor = proveedores.indexOf(proveedorEsperado);
assert.ok(ultimoProveedor >= 0, 'El proveedor esperado debe ser brevo, resend o mailjet.');
assert.ok(['200', '502'].includes(codigoM2), 'El código esperado de M2 debe ser 200 o 502.');

assert.equal(process.env.SUPABASE_URL, 'http://rest:8080', 'Ejecuta la prueba dentro del Compose de laboratorio.');
assert.equal(process.env.M2_URL, `${simuladores}/m2`, 'Levanta Compose con compose.eventos.yaml.');

const email = `eventos-${randomUUID()}@prueba.test`;
const reclamo = {
  nombre: 'Estudiante de prueba',
  codigo_estudiante: '20240001A',
  categoria: 'Matrícula',
  descripcion: 'Prueba de registro por eventos en Docker Compose.',
  avisos: 'api',
};
const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '5m' });
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function registrar() {
  const respuesta = await fetch(`${api}/api/reclamos`, {
    method: 'POST',
    headers,
    body: JSON.stringify(reclamo),
    signal: AbortSignal.timeout(10_000),
  });
  return {
    status: respuesta.status,
    location: respuesta.headers.get('location'),
    body: await respuesta.json(),
  };
}

async function leerEventos() {
  const respuesta = await fetch(`${simuladores}/eventos`, { signal: AbortSignal.timeout(2000) });
  assert.equal(respuesta.status, 200);
  const estado = await respuesta.json();
  return {
    correo: estado.correo.filter(intento => intento.email === email),
    expedientes: estado.expedientes.filter(({ expediente }) => expediente.email === email),
  };
}

await leerEventos();
const creado = await registrar();
assert.equal(creado.status, 201, JSON.stringify(creado.body));
const { id } = creado.body;
assert.ok(id);
assert.equal(creado.body.avisos, 'api');
assert.equal(creado.location, `/api/reclamos/mine/${id}`);

let eventos;
const limite = Date.now() + 15_000;
do {
  eventos = await leerEventos();
  const { correo, expedientes } = eventos;
  if (correo.some(intento => intento.resultado === 200) &&
      correo.every(intento => intento.resultado !== 'pendiente') && expedientes.length) break;
  await esperar(100);
} while (Date.now() < limite);

const { correo, expedientes } = eventos;
assert.deepEqual(correo.map(intento => intento.proveedor), proveedores.slice(0, ultimoProveedor + 1));
assert.deepEqual(correo.filter(intento => intento.resultado === 200), [{
  proveedor: proveedorEsperado, email, asunto: `Reclamo registrado: ${id} — TEFIIS`, resultado: 200,
}]);
assert.equal(expedientes.length, 1);
assert.equal(expedientes[0].status, Number(codigoM2));
assert.deepEqual(expedientes[0].expediente, {
  id, email, nombre: reclamo.nombre, codigoEstudiante: reclamo.codigo_estudiante,
  motivoReclamo: reclamo.categoria, descripcion: reclamo.descripcion,
});

const repetido = await registrar();
assert.equal(repetido.status, 200, JSON.stringify(repetido.body));
assert.equal(repetido.body.id, id);
assert.equal(repetido.body.duplicado, true);
assert.equal(repetido.location, creado.location);
await esperar(800);
assert.deepEqual(await leerEventos(), eventos, 'El reintento generó avisos adicionales.');

console.log(`201 POST /api/reclamos (avisos: api, Location: ${creado.location})`);
console.log(`Correo: ${correo.map(({ proveedor, resultado }) => `${proveedor}=${resultado}`).join(', ')}. Una confirmación aceptada.`);
console.log(`M2: 1 intento HTTP ${codigoM2}, expediente de ${id} comprobado.`);
console.log('200 reintento con el mismo ID y sin avisos adicionales.');
