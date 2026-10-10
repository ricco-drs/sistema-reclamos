import test from 'node:test';
import assert from 'node:assert/strict';
import { cursosValidos, prepararCursosResueltos } from '../dominio/cursosResueltos.js';
import { crearGuardarCursosResueltos } from '../aplicacion/guardarCursosResueltos.js';
import { crearRepositorioCursosSupabase } from '../infraestructura/repositorioCursosSupabase.js';
import { crearGuardarCursosHandler } from '../presentacion/guardarCursosHandler.js';

test('dominio: normaliza código y sección y limita nombre', () => {
  assert.deepEqual(cursosValidos([{ codigo: ' sw708 ', seccion: ' u ', nombre: ' Arquitectura ' }], 'matricular'),
    [{ codigo: 'SW708', seccion: 'U', nombre: 'Arquitectura' }]);
  assert.equal(cursosValidos([{ codigo: 'X', seccion: 'U', nombre: 'a'.repeat(150) }], 'matricular')[0].nombre.length, 120);
  assert.deepEqual(cursosValidos(undefined, 'matricular'), []);
});

test('dominio: rechaza listas incorrectas, exceso y cursos incompletos', () => {
  for (const lista of [null, {}, Array(41).fill({}), [{}], [null], [{ codigo: 'SW708', seccion: ' ' }]]) {
    assert.throws(() => cursosValidos(lista, 'matricular'));
  }
});

test('dominio: conserva 49 entradas previas y añade autor y fecha sin mutar', () => {
  const previo = { historial: Array.from({ length: 60 }, (_, i) => ({ numero: i })) };
  const valor = prepararCursosResueltos(previo, [], [], 'admin@ejemplo.test', '2026-10-09T23:00:00Z');
  assert.equal(valor.historial.length, 50);
  assert.equal(valor.historial[0].numero, 11);
  assert.equal(previo.historial.length, 60);
  assert.equal(valor.historial.at(-1).admin, 'admin@ejemplo.test');
  assert.equal(valor.actualizadoEn, '2026-10-09T23:00:00Z');
});

test('caso de uso: guarda con repositorio falso sin base ni credenciales', async () => {
  let guardado;
  const guardar = crearGuardarCursosResueltos({
    obtener: async id => { assert.equal(id, 'caso-1'); return { cursos_resueltos: {} }; },
    guardar: async (id, valor) => { guardado = { id, valor }; return true; },
  }, () => 'fecha-fija');
  const valor = await guardar({ id: 'caso-1', admin: 'admin', matricular: [{ codigo: 'sw708', seccion: 'u' }] });
  assert.equal(guardado.valor, valor);
  assert.equal(valor.actualizadoPor, 'admin');
  assert.equal(valor.matricular[0].codigo, 'SW708');
});

test('caso de uso: entrada inválida nunca consulta ni guarda', async () => {
  const guardar = crearGuardarCursosResueltos({ obtener: () => assert.fail('No consultar'), guardar: () => assert.fail('No guardar') });
  await assert.rejects(guardar({ matricular: [{}] }), e => e.status === 400);
});

test('caso de uso: inexistencia y desaparición al guardar producen 404', async () => {
  for (const actual of [null, {}]) {
    const guardar = crearGuardarCursosResueltos({ obtener: async () => actual, guardar: async () => false });
    await assert.rejects(guardar({ id: 'no-existe' }), e => e.status === 404);
  }
});

test('adaptador: consulta y PATCH conservan contrato PostgREST', async () => {
  const llamadas = [];
  const repo = crearRepositorioCursosSupabase(async (url, opciones) => {
    llamadas.push({ url, opciones });
    return { ok: true, json: async () => [{ cursos_resueltos: {} }] };
  });
  await repo.obtener('id/con espacio');
  assert.equal(await repo.guardar('id/con espacio', { historial: [] }), true);
  assert.ok(llamadas[0].url.includes('id%2Fcon%20espacio'));
  assert.equal(llamadas[1].opciones.headers.Prefer, 'return=representation');
  assert.deepEqual(JSON.parse(llamadas[1].opciones.body), { cursos_resueltos: { historial: [] } });
});

test('adaptador: informa esquema ausente y reconoce PATCH sin filas', async () => {
  const repoError = crearRepositorioCursosSupabase(async () => ({ ok: false, text: async () => 'cursos_resueltos missing' }));
  await assert.rejects(repoError.obtener('1'), /sql\/cursos_resueltos.sql/);
  const repoVacio = crearRepositorioCursosSupabase(async () => ({ ok: true, json: async () => [] }));
  assert.equal(await repoVacio.obtener('1'), null);
  assert.equal(await repoVacio.guardar('1', {}), false);
});

function respuesta() {
  return { codigo: 200, status(n) { this.codigo = n; return this; }, json(body) { this.body = body; return this; } };
}

test('HTTP: comunica resultado y registra auditoría con identidad autenticada', async () => {
  let auditoria;
  const guardar = crearGuardarCursosResueltos({ obtener: async () => ({}), guardar: async () => true }, () => 'fecha');
  const handler = crearGuardarCursosHandler(guardar, entrada => { auditoria = entrada; });
  const res = respuesta();
  await handler({ params: { id: '1' }, adminEmail: 'autenticado', body: { admin: 'falso', matricular: [{ codigo: 'sw708', seccion: 'u' }] } }, res);
  assert.equal(res.body.success, true);
  assert.equal(res.body.cursos_resueltos.actualizadoPor, 'autenticado');
  assert.deepEqual(auditoria.detalle.matricular, ['SW708-U']);
});

test('HTTP: traduce errores de validación, ausencia e infraestructura', async () => {
  for (const status of [400, 404, undefined]) {
    const handler = crearGuardarCursosHandler(async () => { throw Object.assign(new Error('fallo'), { status }); }, () => assert.fail('No auditar'));
    const res = respuesta();
    await handler({ params: { id: '1' }, body: {} }, res);
    assert.equal(res.codigo, status ?? 500);
    assert.deepEqual(res.body, { error: 'fallo' });
  }
});
