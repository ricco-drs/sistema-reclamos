// Prueba de punta a punta del registro de reclamos con el bus conectado (#51).
//
// Levanta el server.js real contra servicios falsos en localhost (PostgREST y Brevo)
// y comprueba que un registro produce un solo correo de confirmación, que no se
// envía nada a M2, que un reintento no repite el evento, que una caída del correo
// no afecta al reclamo, y que los rechazos responden 400, 401, 403 y 503.
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
  reclamos: [], secuencia: 41, correos: [], llamadasAM2: 0, actividad: [],
  correoCaido: false, tefiDurmiendo: false, noSimuladas: [],
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
  // M2 no se usa: si alguna vez el servidor lo llamara, la prueba lo detecta.
  if (ruta.includes('/m2')) {
    estado.llamadasAM2++;
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

const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'data', 'cursos_secciones.json'), 'utf8'));
const cursoReal = { codigo: catalogo[0].codigo, seccion: catalogo[0].secciones[0] };

async function registrar(cuerpo, { conSesion = true } = {}) {
  const r = await fetch(`${base}/api/reclamos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(conSesion ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(cuerpo),
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

try {
  if (!arriba) throw new Error('server.js no arrancó');

  let r = await registrar(reclamo('sin sesión'), { conSesion: false });
  comprobar('Sin sesión', '401', r.status, r.status === 401);

  r = await registrar({ descripcion: 'sin categoría' });
  comprobar('Sin categoría', '400', `${r.status} «${r.cuerpo.error}»`, r.status === 400);

  r = await registrar({ ...reclamo('prueba ajena'), evidencias: [{ ref: 'otra-persona_uni_pe/evidencias/x.pdf' }] });
  comprobar('Prueba de otro estudiante', '403', `${r.status} «${r.cuerpo.error}»`, r.status === 403);

  const TEXTO = 'Se me cruzan dos cursos en el horario.';
  r = await registrar(reclamo(TEXTO));
  await dejarTerminarConsumidores();
  const id = r.cuerpo.id;
  const guardado = estado.reclamos.find((x) => x.id === id);
  comprobar('Registro válido', '200 con número de caso', `${r.status} ${JSON.stringify(r.cuerpo)}`,
    r.status === 200 && /^REC-\d{4}-\d{4}$/.test(id));
  comprobar('  correos de confirmación', '1', estado.correos.length, estado.correos.length === 1);
  comprobar('  asunto y destinatario', `Reclamo registrado: ${id} — TEFIIS → ${ESTUDIANTE}`,
    `${estado.correos[0]?.asunto} → ${estado.correos[0]?.para}`,
    estado.correos[0]?.asunto === `Reclamo registrado: ${id} — TEFIIS` && estado.correos[0]?.para === ESTUDIANTE);
  comprobar('  llamadas a M2', '0', estado.llamadasAM2, estado.llamadasAM2 === 0);
  comprobar('  cursos fuera del catálogo descartados', '1 curso', guardado?.datos_estudiante?.cursosRetirar?.length,
    guardado?.datos_estudiante?.cursosRetirar?.length === 1);
  comprobar('  actividad registrada', 'reclamo_creado', estado.actividad.join(', '), estado.actividad.includes('reclamo_creado'));

  r = await registrar(reclamo(TEXTO));
  await dejarTerminarConsumidores();
  comprobar('Reintento del mismo texto', 'duplicado y sin correo nuevo',
    `${r.status} ${JSON.stringify(r.cuerpo)}; correos=${estado.correos.length}`,
    r.cuerpo.duplicado === true && r.cuerpo.id === id && estado.correos.length === 1);

  // La ruta anterior sigue mientras la aplicación de estudiantes la llame (#46).
  const rc = await fetch(`${base}/api/reclamos/confirmar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ caseId: id }),
  });
  comprobar('Ruta anterior /api/reclamos/confirmar', '200 y el mismo correo', `${rc.status}; ${estado.correos[1]?.asunto}`,
    rc.status === 200 && estado.correos.length === 2 && estado.correos[1].asunto === estado.correos[0].asunto);
  estado.correos.pop();

  estado.correoCaido = true;
  r = await registrar(reclamo('Otro reclamo, con el correo caído.'));
  await dejarTerminarConsumidores();
  const fallaRegistrada = registro.some((l) => l.includes(`[EVENTOS] correo falló en ${r.cuerpo.id}`));
  comprobar('Correo caído', '200 igual, sin correo y con el error en el registro',
    `${r.status} ${r.cuerpo.id}; correos=${estado.correos.length}; error registrado=${fallaRegistrada}`,
    r.status === 200 && estado.correos.length === 1 && fallaRegistrada);
  estado.correoCaido = false;

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
for (const linea of registro.filter((l) => /\[EVENTOS\]|EMAIL_TIMEOUT_MS|\[EMAIL\]/.test(l))) console.log(linea);
if (estado.noSimuladas.length) console.log('\nRutas que el falso no simula:', estado.noSimuladas);
process.exit(resultados.every((x) => x.ok) ? 0 : 1);
