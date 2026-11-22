import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { crearModuloAcceso } from '../index.js';

const ESTUDIANTE = 'alumno.prueba@uni.pe';
const ADMIN = 'administrador@prueba.test';
const LECTOR = 'lector@prueba.test';

async function montarAcceso(t, opciones) {
  const variables = {
    JWT_SECRET: 'secreto-solo-para-la-prueba-local',
    ADMIN_EMAILS: `${ADMIN}, ${LECTOR}`,
    ADMIN_EMAILS_SOLO_LECTURA: LECTOR,
  };
  for (const [clave, valor] of Object.entries(variables)) {
    const anterior = process.env[clave];
    process.env[clave] = valor;
    t.after(() => {
      if (anterior === undefined) delete process.env[clave];
      else process.env[clave] = anterior;
    });
  }

  const modulo = crearModuloAcceso(opciones);
  const app = express();
  app.use(express.json(), modulo.rutas);
  app.get('/alumno', modulo.requireStudentAuth, (req, res) => res.json({ email: req.studentEmail }));
  app.get('/admin', modulo.requireAdminAuth, (req, res) => res.json({ soloLectura: req.adminSoloLectura }));
  app.post('/admin', modulo.requireAdminAuth, (_req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

const postJson = (url, cuerpo) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cuerpo),
});
const sesion = (token) => ({ Authorization: `Bearer ${token}` });

test('el código enviado permite iniciar sesión una sola vez', async (t) => {
  const enviados = [];
  const actividad = [];
  const base = await montarAcceso(t, {
    sendEmail: async (correo) => enviados.push(correo),
    logActividad: (entrada) => actividad.push(entrada),
    verificarTokenAdmin: null,
  });

  const envio = await postJson(`${base}/api/auth/send-code`, { email: ESTUDIANTE });
  assert.equal(envio.status, 200);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].to, ESTUDIANTE);
  const code = enviados[0].html.match(/>(\d{4})<\/span>/)?.[1];
  assert.ok(code);

  const verificar = () => postJson(`${base}/api/auth/verify-code`, { email: ESTUDIANTE, code });
  const validacion = await verificar();
  assert.equal(validacion.status, 200);
  const { token } = await validacion.json();
  const sinSesion = await fetch(`${base}/alumno`);
  assert.equal(sinSesion.status, 401);
  assert.equal((await sinSesion.json()).codigo, 'SESION_REQUERIDA');
  const alumno = await fetch(`${base}/alumno`, { headers: sesion(token) });
  assert.equal(alumno.status, 200);
  assert.deepEqual(await alumno.json(), { email: ESTUDIANTE });
  assert.equal((await verificar()).status, 400);
  assert.deepEqual(actividad, [{ actorEmail: ESTUDIANTE, actorType: 'estudiante', accion: 'login' }]);
});

test('la lista de administradores y la restricción de solo lectura se aplican por método', async (t) => {
  const base = await montarAcceso(t, {
    verificarTokenAdmin: async (email) => ({ email }),
  });
  const admin = (method, email) => fetch(`${base}/admin`, { method, headers: sesion(email) });

  assert.equal((await fetch(`${base}/admin`)).status, 401);
  assert.equal((await admin('GET', 'otra-cuenta@prueba.test')).status, 403);
  const lectura = await admin('GET', LECTOR);
  assert.equal(lectura.status, 200);
  assert.deepEqual(await lectura.json(), { soloLectura: true });
  assert.equal((await admin('POST', LECTOR)).status, 403);
  assert.equal((await admin('POST', ADMIN)).status, 204);
});
