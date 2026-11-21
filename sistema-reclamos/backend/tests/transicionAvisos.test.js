// Transición entre el front anterior y el nuevo (#51 y #46): cada reclamo tiene que
// seguir un solo camino. El front nuevo manda `avisos: "api"` y la API publica el
// evento; el anterior no lo manda y la API registra sin publicar, porque ese front
// envía él mismo el correo y el expediente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearRegistrarReclamo } from '../aplicacion/registrarReclamo.js';
import { crearRegistrarReclamoHandler, AVISOS_POR_API } from '../presentacion/registrarReclamoHandler.js';
import { crearRepositorioReclamosMemoria } from '../infraestructura/repositorioReclamosMemoria.js';
import { crearPublicadorMemoria } from '../infraestructura/publicadorMemoria.js';

const EMAIL = 'ana.perez@uni.pe';
const AHORA = new Date('2026-11-21T15:04:05.000Z');
const CREADO_EN = AHORA.toISOString();

// Lo mismo que arma server.js: un repositorio y dos casos de uso que solo cambian en el publicador.
function armar({ conTransicion = true } = {}) {
  const reclamos = crearRepositorioReclamosMemoria({ reloj: () => AHORA });
  const publicador = crearPublicadorMemoria();
  const comunes = {
    reclamos,
    politica: { motivoDeRechazo: async () => null },
    catalogoCursos: new Map(),
    esEvidenciaPropia: () => true,
    reloj: () => AHORA,
  };
  const conAvisos = crearRegistrarReclamo({ ...comunes, publicador });
  const sinAvisos = crearRegistrarReclamo({ ...comunes, publicador: { publicar: async () => {} } });
  const handler = conTransicion
    ? crearRegistrarReclamoHandler(conAvisos, { sinAvisos })
    : crearRegistrarReclamoHandler(conAvisos);
  return { reclamos, publicador, handler };
}

function respuesta() {
  return {
    codigo: 200,
    set() { return this; },
    status(n) { this.codigo = n; return this; },
    json(body) { this.body = body; return this; },
  };
}

const cuerpo = (extra = {}) => ({ categoria: 'Cruce de horarios', descripcion: 'Me cruzan dos cursos', ...extra });

async function enviar(handler, body) {
  const res = respuesta();
  await handler({ studentEmail: EMAIL, body }, res);
  return res;
}

test('front anterior (sin avisos): registra el reclamo, no publica el evento y no confirma', async () => {
  const { reclamos, publicador, handler } = armar();
  const res = await enviar(handler, cuerpo());
  assert.equal(res.codigo, 201);
  assert.deepEqual(res.body, { success: true, id: 'REC-2026-0001', estado: 'PENDIENTE', creado_en: CREADO_EN, cursos_descartados: [] });
  assert.equal(reclamos.filas.length, 1);
  assert.equal(publicador.publicados.length, 0);
});

test('front nuevo (avisos: "api"): publica un solo evento y lo confirma en la respuesta', async () => {
  const { reclamos, publicador, handler } = armar();
  const res = await enviar(handler, cuerpo({ avisos: AVISOS_POR_API }));
  assert.equal(res.codigo, 201);
  assert.deepEqual(res.body, { success: true, id: 'REC-2026-0001', estado: 'PENDIENTE', creado_en: CREADO_EN, cursos_descartados: [], avisos: 'api' });
  assert.equal(reclamos.filas.length, 1);
  assert.equal(publicador.publicados.length, 1);
  assert.equal(publicador.publicados[0].reclamo.id, 'REC-2026-0001');
});

test('el campo avisos no se guarda en el reclamo', async () => {
  const { reclamos, handler } = armar();
  await enviar(handler, cuerpo({ avisos: AVISOS_POR_API }));
  assert.equal('avisos' in reclamos.filas[0], false);
});

test('reintento del front nuevo: devuelve el mismo reclamo, lo confirma y no publica otra vez', async () => {
  const { publicador, handler } = armar();
  await enviar(handler, cuerpo({ avisos: AVISOS_POR_API }));
  const res = await enviar(handler, cuerpo({ avisos: AVISOS_POR_API }));
  assert.equal(res.codigo, 200);
  assert.deepEqual(res.body, { success: true, id: 'REC-2026-0001', duplicado: true, creado_en: CREADO_EN, avisos: 'api' });
  assert.equal(publicador.publicados.length, 1);
});

test('un error no confirma avisos, aunque el front los haya pedido', async () => {
  const { publicador, handler } = armar();
  const res = await enviar(handler, { descripcion: 'sin categoría', avisos: AVISOS_POR_API });
  assert.equal(res.codigo, 400);
  assert.deepEqual(res.body, { error: 'Categoría y descripción son requeridas.', codigo: 'DATOS_INCOMPLETOS' });
  assert.equal(publicador.publicados.length, 0);
});

test('otro valor en avisos se trata como el front anterior', async () => {
  const { publicador, handler } = armar();
  const res = await enviar(handler, cuerpo({ avisos: 'front' }));
  assert.deepEqual(res.body, { success: true, id: 'REC-2026-0001', estado: 'PENDIENTE', creado_en: CREADO_EN, cursos_descartados: [] });
  assert.equal(publicador.publicados.length, 0);
});

test('sin transición (cuando ya no quede el front anterior): todo publica y solo se confirma si se pidió', async () => {
  const { publicador, handler } = armar({ conTransicion: false });
  const a = await enviar(handler, cuerpo({ descripcion: 'primero' }));
  assert.deepEqual(a.body, { success: true, id: 'REC-2026-0001', estado: 'PENDIENTE', creado_en: CREADO_EN, cursos_descartados: [] });
  const b = await enviar(handler, cuerpo({ descripcion: 'segundo', avisos: AVISOS_POR_API }));
  assert.deepEqual(b.body, { success: true, id: 'REC-2026-0002', estado: 'PENDIENTE', creado_en: CREADO_EN, cursos_descartados: [], avisos: 'api' });
  assert.equal(publicador.publicados.length, 2);
});
