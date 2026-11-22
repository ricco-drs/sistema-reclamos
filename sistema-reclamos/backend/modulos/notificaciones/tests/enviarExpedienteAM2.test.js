// El consumidor de M2 sin el módulo reclamos: la fuente de expedientes es un doble.
// Que el repositorio real de reclamos cumpla ese puerto lo prueba backend/tests/flujoReclamoRegistrado.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearEnviadorDeExpediente } from '../aplicacion/enviarExpedienteAM2.js';
import { crearClienteM2Http, crearClienteM2Memoria } from '../infraestructura/clienteM2.js';

const EMAIL = 'ana.perez@uni.pe';
const guardado = {
  id: 'REC-2026-0001', codigo_estudiante: '20240001A', email: EMAIL, nombre: 'PEREZ, ANA',
  categoria: 'Cruce de horarios', descripcion: 'Texto formal del reclamo',
};
const fuenteCon = (...filas) => ({ obtenerParaExpediente: async (id) => filas.find((f) => f.id === id) ?? null });

test('consumidor de M2: con solo el id del evento, arma el expediente con lo que da la fuente', async () => {
  const m2 = crearClienteM2Memoria();
  await crearEnviadorDeExpediente({ fuente: fuenteCon(guardado), m2 })({ reclamo: { id: 'REC-2026-0001' } });
  assert.deepEqual(m2.expedientes, [{
    id: 'REC-2026-0001', codigoEstudiante: '20240001A', email: EMAIL, nombre: 'PEREZ, ANA',
    motivoReclamo: 'Cruce de horarios', descripcion: 'Texto formal del reclamo',
  }]);
});

test('consumidor de M2: sin código ni nombre los manda vacíos, como el front anterior', async () => {
  const m2 = crearClienteM2Memoria();
  await crearEnviadorDeExpediente({ fuente: fuenteCon({ ...guardado, codigo_estudiante: null, nombre: null }), m2 })({ reclamo: { id: 'REC-2026-0001' } });
  assert.equal(m2.expedientes[0].codigoEstudiante, '');
  assert.equal(m2.expedientes[0].nombre, '');
});

test('consumidor de M2: si el reclamo no existe, falla en vez de enviar vacío', async () => {
  const m2 = crearClienteM2Memoria();
  const consumir = crearEnviadorDeExpediente({ fuente: fuenteCon(), m2 });
  await assert.rejects(consumir({ reclamo: { id: 'REC-2026-9999' } }), /no existe/);
  assert.equal(m2.expedientes.length, 0);
});

test('cliente M2 HTTP: manda el contrato actual y falla con error si M2 responde mal', async () => {
  const llamadas = [];
  const ok = crearClienteM2Http({ url: 'http://m2.test/api/v1/m2/expedientes', fetchFn: async (u, o) => { llamadas.push([u, o]); return { ok: true }; } });
  await ok.registrarExpediente({ id: 'R1', descripcion: 'd' });
  assert.equal(llamadas[0][0], 'http://m2.test/api/v1/m2/expedientes');
  assert.equal(llamadas[0][1].method, 'POST');
  assert.equal(llamadas[0][1].headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(llamadas[0][1].body), { id: 'R1', descripcion: 'd' });
  const mal = crearClienteM2Http({ url: 'http://m2.test', fetchFn: async () => ({ ok: false, status: 502 }) });
  await assert.rejects(mal.registrarExpediente({ id: 'R1' }), /M2 respondió 502/);
});
