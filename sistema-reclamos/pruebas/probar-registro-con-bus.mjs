// Prueba de punta a punta del registro de reclamos con el bus conectado (#51).
//
// Levanta el server.js real contra servicios falsos en localhost (PostgREST, Brevo
// y M2) y comprueba que cada reclamo produce un solo correo de confirmación y un
// solo expediente, venga del front nuevo (que manda `avisos: "api"` y deja los envíos
// a la API) o del anterior (que los hace él mismo); que un reintento no repite los
// envíos; que la caída del correo o de M2 no afecta al reclamo ni al otro envío; y que
// los rechazos responden 400, 401, 403 y 503.
//
// Uso, desde sistema-reclamos/:
//   node pruebas/probar-registro-con-bus.mjs
//
// No toca ningún servicio real. server.js carga el .env de sistema-reclamos/, que
// puede tener las claves de producción; por eso la prueba copia el backend a
// pruebas/.tmp-bus/ (sin .env) y lo arranca desde ahí. La copia se borra al final.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PRUEBAS = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(PRUEBAS, '..');
const COPIA = path.join(PRUEBAS, '.tmp-bus');
const SECRETO = crypto.randomBytes(16).toString('hex');

// ── Copia del backend, sin .env ──
// Queda dentro de sistema-reclamos/ para que Node encuentre node_modules sin enlaces.
fs.rmSync(COPIA, { recursive: true, force: true });
const BACKEND = path.join(RAIZ, 'backend');
fs.cpSync(BACKEND, path.join(COPIA, 'backend'), {
  recursive: true,
  filter: (origen) => path.relative(BACKEND, origen).split(path.sep)[0] !== 'tests',
});
fs.mkdirSync(path.join(COPIA, 'src', 'data'), { recursive: true });
fs.copyFileSync(path.join(RAIZ, 'src', 'data', 'cursos_secciones.json'), path.join(COPIA, 'src', 'data', 'cursos_secciones.json'));

// ── Servicios falsos ──
const estado = {
  reclamos: [], secuencia: 41, correos: [], expedientes: [], actividad: [],
  correoCaido: false, m2Caido: false, tefiDurmiendo: false, noSimuladas: [],
};
const leerCuerpo = (req) => new Promise((listo) => {
  let datos = '';
  req.on('data', (trozo) => { datos += trozo; });
  req.on('end', () => listo(datos));
});
const responder = (res, status, cuerpo) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(cuerpo));
};

const falso = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const q = Object.fromEntries(url.searchParams);
  const cuerpo = await leerCuerpo(req);
  const ruta = url.pathname;

  if (ruta === '/rest/v1/app_settings' && req.method === 'GET') {
    return responder(res, 200, q.key === 'eq.tefi_durmiendo' && estado.tefiDurmiendo ? [{ value: true }] : []);
  }
  if (ruta === '/rest/v1/rpc/siguiente_id_reclamo') return responder(res, 200, ++estado.secuencia);
  if (ruta === '/rest/v1/reclamos' && req.method === 'POST') {
    estado.reclamos.push({ ...JSON.parse(cuerpo), created_at: new Date().toISOString() });
    return responder(res, 201, {});
  }
  if (ruta === '/rest/v1/reclamos' && req.method === 'GET') {
    const deEseCorreo = (r) => `eq.${r.email}` === q.email;
    const conEseId = (r) => `eq.${r.id}` === q.id;
    if (q.select === 'id,descripcion') {
      return responder(res, 200, estado.reclamos.filter(deEseCorreo).map(({ id, descripcion }) => ({ id, descripcion })));
    }
    if (q.select === 'id') return responder(res, 200, []);
    if (q.select?.startsWith('id,codigo_estudiante')) return responder(res, 200, estado.reclamos.filter(conEseId));
    if (q.select === 'id,email,nombre,categoria') {
      return responder(res, 200, estado.reclamos.filter((r) => conEseId(r) && deEseCorreo(r)));
    }
  }
  if (ruta === '/rest/v1/activity_log' && req.method === 'POST') {
    estado.actividad.push(JSON.parse(cuerpo).accion);
    return responder(res, 201, {});
  }
  if (ruta === '/brevo') {
    if (estado.correoCaido) return responder(res, 500, { message: 'Brevo caído a propósito' });
    const correo = JSON.parse(cuerpo);
    estado.correos.push({ para: correo.to[0].email, asunto: correo.subject });
    return responder(res, 201, { messageId: 'falso' });
  }
  if (ruta === '/m2') {
    if (estado.m2Caido) return responder(res, 500, { error: 'M2 caído a propósito' });
    estado.expedientes.push(JSON.parse(cuerpo));
    return responder(res, 201, {});
  }
  estado.noSimuladas.push(`${req.method} ${req.url}`);
  return responder(res, 404, {});
});
await new Promise((listo) => falso.listen(0, '127.0.0.1', listo));
const urlFalso = `http://127.0.0.1:${falso.address().port}`;

// Un puerto libre para la API.
const puertoApi = await new Promise((listo) => {
  const s = http.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => listo(p)); });
});

// ── server.js real, apuntando a los falsos ──
// Solo recibe estas variables: nada del entorno de quien corre la prueba.
const entorno = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  PORT: String(puertoApi),
  JWT_SECRET: SECRETO,
  SUPABASE_URL: urlFalso,
  SUPABASE_SERVICE_KEY: 'falsa',
  VITE_API_KEY: 'falsa',
  FROM_EMAIL: 'tefiis@prueba.test',
  BREVO_API_KEY: 'falsa',
  BREVO_API_URL: `${urlFalso}/brevo`,
  M2_URL: `${urlFalso}/m2`,
  EMAIL_TIMEOUT_MS: 'abc', // a propósito: el servidor tiene que avisar y usar 3000
};
const registro = [];
const api = spawn(process.execPath, ['backend/server.js'], { cwd: COPIA, env: entorno });
for (const salida of [api.stdout, api.stderr]) {
  salida.on('data', (d) => registro.push(...String(d).split('\n').filter(Boolean)));
}

const espera = (ms) => new Promise((listo) => setTimeout(listo, ms));
const base = `http://127.0.0.1:${puertoApi}`;
let arriba = false;
for (let i = 0; i < 50 && !arriba; i++) {
  try { await fetch(`${base}/api/reclamos`, { method: 'POST' }); arriba = true; } catch { await espera(200); }
}

// ── Sesión de estudiante: el mismo JWT HS256 que firma POST /api/auth/verify-code ──
const b64 = (objeto) => Buffer.from(JSON.stringify(objeto)).toString('base64url');
const ahora = Math.floor(Date.now() / 1000);
const ESTUDIANTE = 'estudiante-001@prueba.test';
const sinFirma = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ email: ESTUDIANTE, iat: ahora, exp: ahora + 3600 })}`;
const token = `${sinFirma}.${crypto.createHmac('sha256', SECRETO).update(sinFirma).digest('base64url')}`;
const conSesion = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'data', 'cursos_secciones.json'), 'utf8'));
const cursoReal = { codigo: catalogo[0].codigo, seccion: catalogo[0].secciones[0] };

// El front nuevo manda `avisos: "api"`; el anterior no.
async function registrar(cuerpo, { sesion = true, frontNuevo = true } = {}) {
  const r = await fetch(`${base}/api/reclamos`, {
    method: 'POST',
    headers: sesion ? conSesion : { 'Content-Type': 'application/json' },
    body: JSON.stringify(frontNuevo ? { ...cuerpo, avisos: 'api' } : cuerpo),
  });
  return { status: r.status, cuerpo: await r.json() };
}
const reclamo = (descripcion) => ({
  nombre: 'PUERTA RAMOS, ANA LUCIA',
  codigo_estudiante: '20240001A',
  categoria: 'Cruce de horarios',
  descripcion,
  cursos_retirar: [cursoReal, { codigo: 'XX999', seccion: 'Z' }],
  cursos_matricular: [],
});

const resultados = [];
const comprobar = (caso, esperado, obtenido, ok) => resultados.push({ caso, esperado, obtenido, ok: Boolean(ok) });
// Los consumidores corren después de responder: se les da un momento.
const dejarTerminarConsumidores = () => espera(800);
const contar = () => `correos=${estado.correos.length}, expedientes=${estado.expedientes.length}`;
const errorRegistrado = (consumidor, id) => registro.some((l) => l.includes(`[EVENTOS] ${consumidor} falló en ${id}`));

try {
  if (!arriba) throw new Error('server.js no arrancó');

  // ── Rechazos ──
  let r = await registrar(reclamo('sin sesión'), { sesion: false });
  comprobar('Sin sesión', '401', r.status, r.status === 401);

  r = await registrar({ descripcion: 'sin categoría' });
  comprobar('Sin categoría', '400, sin avisos en la respuesta', `${r.status} ${JSON.stringify(r.cuerpo)}`,
    r.status === 400 && !('avisos' in r.cuerpo));

  r = await registrar({ ...reclamo('prueba ajena'), evidencias: [{ ref: 'otra-persona_uni_pe/evidencias/x.pdf' }] });
  comprobar('Prueba de otro estudiante', '403', `${r.status} «${r.cuerpo.error}»`, r.status === 403);

  // ── Front nuevo: la API envía el correo y el expediente ──
  const TEXTO = 'Se me cruzan dos cursos en el horario.';
  r = await registrar(reclamo(TEXTO));
  await dejarTerminarConsumidores();
  const id = r.cuerpo.id;
  const guardado = estado.reclamos.find((x) => x.id === id);
  comprobar('Front nuevo: registro', '200 con número y avisos: "api"', `${r.status} ${JSON.stringify(r.cuerpo)}`,
    r.status === 200 && /^REC-\d{4}-\d{4}$/.test(id) && r.cuerpo.avisos === 'api');
  comprobar('  un correo de la API', `Reclamo registrado: ${id} — TEFIIS → ${ESTUDIANTE}`,
    `${contar()}; ${estado.correos[0]?.asunto} → ${estado.correos[0]?.para}`,
    estado.correos.length === 1 && estado.correos[0].asunto === `Reclamo registrado: ${id} — TEFIIS`
      && estado.correos[0].para === ESTUDIANTE);
  comprobar('  un expediente en M2, con la descripción', `1, «${TEXTO}»`,
    `${estado.expedientes.length}, «${estado.expedientes[0]?.descripcion}»`,
    estado.expedientes.length === 1 && estado.expedientes[0].id === id && estado.expedientes[0].descripcion === TEXTO);
  comprobar('  cursos fuera del catálogo descartados', '1 curso', guardado?.datos_estudiante?.cursosRetirar?.length,
    guardado?.datos_estudiante?.cursosRetirar?.length === 1);
  comprobar('  el campo avisos no se guarda', 'no está en la fila', 'avisos' in (guardado ?? {}) ? 'está' : 'no está',
    guardado && !('avisos' in guardado));
  comprobar('  actividad registrada', 'reclamo_creado', estado.actividad.join(', '), estado.actividad.includes('reclamo_creado'));

  r = await registrar(reclamo(TEXTO));
  await dejarTerminarConsumidores();
  comprobar('Front nuevo: reintento del mismo texto', 'duplicado, sin envíos nuevos',
    `${r.status} ${JSON.stringify(r.cuerpo)}; ${contar()}`,
    r.cuerpo.duplicado === true && r.cuerpo.id === id && r.cuerpo.avisos === 'api'
      && estado.correos.length === 1 && estado.expedientes.length === 1);

  // ── Front anterior: la API no envía nada; el front pide el correo a /confirmar ──
  r = await registrar(reclamo('Reclamo desde la página anterior.'), { frontNuevo: false });
  await dejarTerminarConsumidores();
  const idAnterior = r.cuerpo.id;
  comprobar('Front anterior: registro', '200 sin avisos, y la API no envía nada',
    `${r.status} ${JSON.stringify(r.cuerpo)}; ${contar()}`,
    r.status === 200 && !('avisos' in r.cuerpo) && estado.correos.length === 1 && estado.expedientes.length === 1);
  const rc = await fetch(`${base}/api/reclamos/confirmar`, {
    method: 'POST', headers: conSesion, body: JSON.stringify({ caseId: idAnterior }),
  });
  comprobar('  su correo sale por /api/reclamos/confirmar', `un solo correo de ${idAnterior}`,
    `${rc.status}; ${estado.correos.filter((c) => c.asunto.includes(idAnterior)).length} correo(s)`,
    rc.status === 200 && estado.correos.filter((c) => c.asunto.includes(idAnterior)).length === 1);

  // ── Caídas: cada consumidor falla por su cuenta ──
  estado.correoCaido = true;
  const antes = { correos: estado.correos.length, expedientes: estado.expedientes.length };
  r = await registrar(reclamo('Otro reclamo, con el correo caído.'));
  await dejarTerminarConsumidores();
  comprobar('Correo caído', '200, sin correo, con el expediente y el error registrado',
    `${r.status} ${r.cuerpo.id}; ${contar()}; error registrado=${errorRegistrado('correo', r.cuerpo.id)}`,
    r.status === 200 && estado.correos.length === antes.correos && estado.expedientes.length === antes.expedientes + 1
      && errorRegistrado('correo', r.cuerpo.id));
  estado.correoCaido = false;

  estado.m2Caido = true;
  const antes2 = { correos: estado.correos.length, expedientes: estado.expedientes.length };
  r = await registrar(reclamo('Otro reclamo, con M2 caído.'));
  await dejarTerminarConsumidores();
  comprobar('M2 caído', '200, con el correo, sin expediente y el error registrado',
    `${r.status} ${r.cuerpo.id}; ${contar()}; error registrado=${errorRegistrado('m2', r.cuerpo.id)}`,
    r.status === 200 && estado.correos.length === antes2.correos + 1 && estado.expedientes.length === antes2.expedientes
      && errorRegistrado('m2', r.cuerpo.id));
  estado.m2Caido = false;

  estado.tefiDurmiendo = true;
  await espera(10_500); // los interruptores se leen con una caché de 10 s
  r = await registrar(reclamo('Con Tefi durmiendo.'));
  comprobar('Tefi durmiendo', '503', `${r.status} «${r.cuerpo.error}»`, r.status === 503);
} catch (err) {
  comprobar('La prueba terminó', 'sin excepciones', err.message, false);
} finally {
  api.kill();
  falso.close();
  await espera(300);
  fs.rmSync(COPIA, { recursive: true, force: true });
}

console.log('=== Resultados ===');
for (const x of resultados) console.log(`${x.ok ? 'OK ' : 'MAL'} ${x.caso}: esperado ${x.esperado} | obtenido ${x.obtenido}`);
console.log(`\n${resultados.filter((x) => x.ok).length} de ${resultados.length} correctos.`);
console.log('\n=== Avisos y errores del servidor ===');
for (const linea of registro.filter((l) => /\[EVENTOS\]|EMAIL_TIMEOUT_MS|M2_URL|\[EMAIL\]/.test(l))) console.log(linea);
if (estado.noSimuladas.length) console.log('\nRutas que el falso no simula:', estado.noSimuladas);
process.exit(resultados.every((x) => x.ok) ? 0 : 1);
