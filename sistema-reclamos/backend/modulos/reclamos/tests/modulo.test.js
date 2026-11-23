// El módulo se monta solo, sin server.js ni las demás rutas: lo que necesita de afuera
// (PostgREST, sesiones, interruptores, bus) se le pasa con dobles. Es lo que
// docs/particiones.md promete para E3: probar las rutas de reclamos sin levantar todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { crearPublicadorMemoria } from '@tefiis/compartido';
import { crearModuloReclamos } from '../index.js';

const EMAIL = 'ana.perez@uni.pe';
const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

function postgrestFalso() {
  const filas = [];
  const llamadas = [];
  const sbRest = async (ruta, opciones = {}) => {
    llamadas.push(`${opciones.method ?? 'GET'} ${ruta}`);
    if (ruta.startsWith('/reclamos?select=id,descripcion,created_at')) return json([]);
    if (ruta === '/rpc/siguiente_id_reclamo') return json(7);
    if (ruta === '/reclamos' && opciones.method === 'POST') { filas.push(JSON.parse(opciones.body)); return new Response(null, { status: 201 }); }
    if (ruta.startsWith('/reclamos?select=id,codigo_estudiante')) {
      const id = decodeURIComponent(ruta.match(/id=eq\.([^&]+)/)[1]);
      return json(filas.filter((f) => f.id === id));
    }
    return json({ error: `ruta no simulada: ${ruta}` }, 500);
  };
  return { sbRest, filas, llamadas };
}

async function levantar({ abierta = true } = {}) {
  const pg = postgrestFalso();
  const publicador = crearPublicadorMemoria();
  const modulo = crearModuloReclamos({
    limiteEnvioCodigo: (_req, _res, next) => next(),
    sbRest: pg.sbRest,
    publicador,
    interruptores: {
      tefiDurmiendoActivo: async () => false,
      despedidaActivaPara: async () => false,
      puedeEnviarReclamo: async () => abierta,
    },
    catalogoCursos: new Map(),
    esEvidenciaPropia: () => true,
    esDocumentoPropio: () => true,
    logActividad: () => {},
    registrarError: () => {},
    // Sesiones falsas: el módulo no sabe cómo se verifican, solo cuál exige cada ruta.
    exigirEstudiante: (req, res, next) => (req.headers['x-estudiante']
      ? (req.studentEmail = req.headers['x-estudiante'], next())
      : res.status(401).json({ codigo: 'SESION_REQUERIDA' })),
    exigirAdmin: (req, res) => res.status(403).json({ error: 'solo admin' }),
  });
  const app = express();
  app.use(express.json());
  app.use(modulo.rutas);
  const servidor = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cerrar = () => new Promise((ok) => servidor.close(ok));
  return { base, cerrar, modulo, publicador, ...pg };
}

const reclamo = { categoria: 'Cruce de horarios', descripcion: 'Me cruzan dos cursos', avisos: 'api' };
const enviar = (base, cuerpo, headers = {}) => fetch(`${base}/api/reclamos`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(cuerpo),
});

test('módulo solo: POST /api/reclamos exige la sesión que le pasan, registra y publica el evento', async () => {
  const s = await levantar();
  try {
    assert.equal((await enviar(s.base, reclamo)).status, 401);
    const r = await enviar(s.base, reclamo, { 'x-estudiante': EMAIL });
    const cuerpo = await r.json();
    assert.equal(r.status, 201);
    assert.equal(cuerpo.id, 'REC-2026-0007');
    assert.equal(r.headers.get('location'), '/api/reclamos/mine/REC-2026-0007');
    assert.equal(s.filas.length, 1);
    assert.equal(s.filas[0].email, EMAIL);
    assert.equal(s.publicador.publicados.length, 1);
  } finally { await s.cerrar(); }
});

test('módulo solo: sin avisos (front anterior) registra sin publicar', async () => {
  const s = await levantar();
  try {
    const { avisos: _avisos, ...sinAvisos } = reclamo;
    const r = await enviar(s.base, sinAvisos, { 'x-estudiante': EMAIL });
    assert.equal(r.status, 201);
    assert.equal(s.publicador.publicados.length, 0);
  } finally { await s.cerrar(); }
});

test('módulo solo: con la ventana cerrada, la política armada con los interruptores rechaza con 409', async () => {
  const s = await levantar({ abierta: false });
  try {
    const r = await enviar(s.base, reclamo, { 'x-estudiante': EMAIL });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).codigo, 'VENTANA_CERRADA');
    assert.equal(s.filas.length, 0);
  } finally { await s.cerrar(); }
});

test('módulo solo: PUT de cursos resueltos pasa por la sesión de admin que le pasan', async () => {
  const s = await levantar();
  try {
    const r = await fetch(`${s.base}/api/admin/reclamos/REC-2026-0007/cursos-resueltos`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(r.status, 403);
  } finally { await s.cerrar(); }
});

test('módulo solo: la fuente de expedientes lee del mismo repositorio lo que necesita notificaciones', async () => {
  const s = await levantar();
  try {
    await enviar(s.base, { ...reclamo, nombre: 'PEREZ, ANA', codigo_estudiante: '20240001A' }, { 'x-estudiante': EMAIL });
    const fila = await s.modulo.fuenteDeExpedientes.obtenerParaExpediente('REC-2026-0007');
    assert.equal(fila.descripcion, 'Me cruzan dos cursos');
    assert.equal(fila.codigo_estudiante, '20240001A');
    assert.ok(s.llamadas.at(-1).startsWith('GET /reclamos?select=id,codigo_estudiante,email,nombre,categoria,descripcion&id=eq.REC-2026-0007'));
  } finally { await s.cerrar(); }
});
