import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOMINIO_PRUEBA,
  correoEstudiantePrueba,
  generarFilasReclamos,
  limpiarReclamosPrueba,
  sembrarReclamos,
} from '../../scripts/sembrar-reclamos.js';

test('sembrar-reclamos: genera 1 500 filas con ids únicos, 200 correos @prueba.test y los 6 estados', () => {
  const filas = generarFilasReclamos({ cantidad: 1500, estudiantes: 200, desdeNumero: 1001, anio: 2026 });
  assert.equal(filas.length, 1500);
  assert.equal(filas[0].id, 'REC-2026-1001');
  assert.equal(filas.at(-1).id, 'REC-2026-2500');

  const idsUnicos = new Set(filas.map((f) => f.id));
  assert.equal(idsUnicos.size, 1500);

  const correosUnicos = new Set(filas.map((f) => f.email));
  assert.equal(correosUnicos.size, 200);
  assert.ok(correosUnicos.has(correoEstudiantePrueba(1, 200)));
  assert.ok(correosUnicos.has(correoEstudiantePrueba(200, 200)));
  assert.ok([...correosUnicos].every((c) => c.endsWith(`@${DOMINIO_PRUEBA}`)));

  const estadosUnicos = new Set(filas.map((f) => f.estado));
  assert.deepEqual(
    [...estadosUnicos].sort(),
    ['ACEPTADO', 'ACEPTADO_PARCIALMENTE', 'EN_REVISION', 'MATRICULADO', 'PENDIENTE', 'RECHAZADO'],
  );
});

const entornoCompose = { baseUrl: 'http://rest:8080', serviceKey: 'solo-laboratorio' };

test('siembra: envía las 1 500 filas en una sola inserción sin actualización ni limpieza', async () => {
  const llamadas = [];
  const resumen = await sembrarReclamos({
    ...entornoCompose,
    fetchFn: async (url, peticion) => {
      llamadas.push({ url, peticion });
      return new Response(null, { status: 201 });
    },
  });
  assert.equal(llamadas.length, 1);
  const [{ url, peticion }] = llamadas;
  assert.equal(url.href, 'http://postgrest:3000/reclamos');
  assert.equal(peticion.method, 'POST');
  assert.equal(peticion.headers.Prefer, 'return=minimal');
  assert.equal(peticion.redirect, 'error');
  assert.equal(JSON.parse(peticion.body).length, 1500);
  assert.equal(resumen.sembrados, 1500);
});

test('siembra: una colisión detiene la operación con un error claro', async () => {
  await assert.rejects(sembrarReclamos({
    ...entornoCompose,
    cantidad: 2,
    fetchFn: async () => new Response(null, { status: 409 }),
  }), /ID de reclamo repetido/);
});

test('limpieza: exige el correo sintético y el marcador de siembra E2', async () => {
  await limpiarReclamosPrueba({
    ...entornoCompose,
    fetchFn: async (url, peticion) => {
      assert.equal(peticion.method, 'DELETE');
      assert.equal(peticion.redirect, 'error');
      assert.equal(url.searchParams.get('email'), 'like.*@prueba.test');
      assert.equal(url.searchParams.get('and'), '(descripcion.like.Reclamo sembrado #*,descripcion.like.*para prueba de bandeja E2.)');
      return new Response(null, { status: 204 });
    },
  });
});

test('siembra y limpieza: un entorno distinto de Compose falla antes de llamar a PostgREST', async () => {
  const fetchFn = () => assert.fail('No debe hacer peticiones fuera de Compose');
  const configuraciones = [
    { baseUrl: 'https://prueba.example', serviceKey: entornoCompose.serviceKey },
    { baseUrl: entornoCompose.baseUrl, serviceKey: 'otra-clave' },
  ];
  for (const configuracion of configuraciones) {
    for (const operar of [sembrarReclamos, limpiarReclamosPrueba]) {
      await assert.rejects(operar({ ...configuracion, fetchFn }), /contenedor api de Docker Compose/);
    }
  }
});
