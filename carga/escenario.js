// Escenario E2 de docs/escenarios.md, la bandeja del panel del Tercio (Lab12).
//
// Fuente: hasta 10 miembros del Tercio a la vez.
// Estímulo: abren o recargan la bandeja de reclamos (GET /api/admin/reclamos).
// Medida: latencia p95 menor a 1,5 s y 0 reclamos faltantes, es decir, el total
// listado coincide con count(*) de la tabla.
//
// La carga y el umbral salen de E2, no de quien corre la prueba. Se corre dentro
// de la red de Compose; los pasos están en carga/README.md.
import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://api:3005';
const REST = __ENV.REST || 'http://rest:8080';
const AUTH = __ENV.AUTH || 'http://firebase-auth:9099';
// El correo tiene que estar en ADMIN_EMAILS de la API (carga/compose.yaml).
const CORREO_ADMIN = __ENV.CORREO_ADMIN || 'tercio-carga@prueba.test';
// E2 se mide con 1 500 reclamos sembrados (scripts/sembrar-reclamos.js).
const MINIMO_SEMBRADO = 1500;

// Por cada respuesta: cuántos reclamos de la tabla no llegaron a la bandeja.
const faltantes = new Trend('reclamos_faltantes');

export const options = {
  // La carga de E2: 10 usuarios virtuales durante 3 minutos.
  vus: 10,
  duration: '3m',
  thresholds: {
    // Umbral de E2: p95 de la bandeja por debajo de 1,5 s...
    'http_req_duration{escenario:bandeja}': ['p(95)<1500'],
    // ...y ningún reclamo faltante en ninguna respuesta.
    reclamos_faltantes: ['max==0'],
    // Estos dos no son umbrales: solo hacen que k6 muestre aparte las peticiones
    // a la bandeja, sin las tres de la preparación (sesión y conteo).
    'http_reqs{escenario:bandeja}': ['count>=0'],
    'http_req_failed{escenario:bandeja}': ['rate>=0'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const preparacion = { tags: { escenario: 'preparacion' } };

// Inicia sesión en el emulador de Firebase como un miembro del Tercio. La
// primera vez la cuenta no existe (400) y se crea. Devuelve el ID token, que
// dura una hora: alcanza de sobra para una corrida de 3 minutos.
function iniciarSesion() {
  const cuenta = JSON.stringify({ email: CORREO_ADMIN, password: 'solo-medicion', returnSecureToken: true });
  const params = {
    ...preparacion,
    headers: { 'Content-Type': 'application/json' },
    responseCallback: http.expectedStatuses(200, 400),
  };
  const url = (accion) => `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${accion}?key=emulador`;

  let r = http.post(url('signInWithPassword'), cuenta, params);
  if (r.status === 400) r = http.post(url('signUp'), cuenta, params);
  if (r.status !== 200) fail(`No se pudo iniciar sesión en el emulador de Firebase: ${r.status} ${r.body}`);
  return r.json('idToken');
}

// count(*) de la tabla reclamos, leído directo de PostgREST (Prefer:
// count=exact) y no a través de la API que se está midiendo.
function contarReclamos() {
  const r = http.get(`${REST}/rest/v1/reclamos?select=id&limit=1`, {
    ...preparacion,
    headers: { Prefer: 'count=exact' },
  });
  const total = Number((r.headers['Content-Range'] || '').split('/')[1]);
  if (r.status >= 300 || !Number.isInteger(total)) fail(`No se pudo contar los reclamos: ${r.status} ${r.body}`);
  return total;
}

export function setup() {
  const token = iniciarSesion();
  const total = contarReclamos();
  if (total < MINIMO_SEMBRADO) {
    fail(`La tabla tiene ${total} reclamos y E2 pide ${MINIMO_SEMBRADO}: falta sembrarlos (carga/README.md).`);
  }
  console.log(`Reclamos en la tabla (count(*)): ${total}`);
  return { token, total };
}

export default function ({ token, total }) {
  const r = http.get(`${BASE}/api/admin/reclamos`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { escenario: 'bandeja' },
  });

  // Se cuentan los id distintos, no los elementos: un reclamo repetido no
  // puede tapar a uno que falta.
  let listados = 0;
  if (r.status === 200) listados = new Set(r.json().map((reclamo) => reclamo.id)).size;
  faltantes.add(total - listados);

  check(r, { 'la bandeja responde 200': (x) => x.status === 200 });
  check(listados, { 'la bandeja trae todos los reclamos': (n) => n === total });

  // Cada miembro del Tercio recarga como máximo una vez por segundo: con 10
  // usuarios el throughput no puede pasar de 10 solicitudes por segundo.
  sleep(1);
}
