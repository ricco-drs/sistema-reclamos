// Prueba el cliente generado desde docs/api/openapi.yaml (src/api/generado) contra una API en marcha,
// para comprobar que sus tipos y sus conversiones coinciden con lo que responde de verdad.
//
// Uso, desde sistema-reclamos/ y con la API de Docker Compose levantada (docker compose up --wait):
//   JWT_SECRET=tefiis-jwt-solo-laboratorio node pruebas/generar-tokens.js --cantidad 2
//   API_URL=http://localhost:3005 TOKEN=<un token de pruebas/tokens.json> \
//     npx --yes tsx@4.20.5 pruebas/probar-cliente-generado.ts
//
// Crea reclamos de prueba a nombre del estudiante del token: es para el entorno de pruebas, no para producción.

import process from 'node:process';
import { Configuration, ReclamosDelEstudianteApi } from '../src/api/generado';
import { ErrorDeApi, registrarReclamo } from '../src/api/reclamos';

const URL_API = process.env.API_URL ?? 'http://localhost:3005';
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('Falta TOKEN: un token de estudiante de pruebas/tokens.json (campo "token").');
  process.exit(2);
}

const api = (accessToken?: string) => new ReclamosDelEstudianteApi(new Configuration({ basePath: URL_API, accessToken }));
const sesion = api(TOKEN);
const marca = `cliente generado ${new Date().toISOString()}`;
const base = { categoria: 'Cruce de horarios', descripcion: `Prueba del ${marca}` };

const resultados: { caso: string; esperado: string; obtenido: string; ok: boolean }[] = [];
const comprobar = (caso: string, esperado: string, obtenido: string, ok: boolean) => resultados.push({ caso, esperado, obtenido, ok });

async function error(promesa: Promise<unknown>): Promise<ErrorDeApi | null> {
  try { await promesa; return null; } catch (e) { return e instanceof ErrorDeApi ? e : null; }
}

// 201: se crea.
const creado = await registrarReclamo(sesion, { ...base, codigoEstudiante: '20240001A', avisos: 'api' });
comprobar('Registrar', '201: tipo creado, estado PENDIENTE, creadoEn Date, cursosDescartados [], avisos api, Location',
  `${creado.tipo}; ${creado.reclamo.id}; ${'estado' in creado.reclamo ? creado.reclamo.estado : '—'}; ${creado.ubicacion}`,
  creado.tipo === 'creado' && creado.reclamo.estado === 'PENDIENTE' && creado.reclamo.creadoEn instanceof Date
    && Array.isArray(creado.reclamo.cursosDescartados) && creado.reclamo.avisos === 'api'
    && creado.ubicacion === `/api/reclamos/mine/${creado.reclamo.id}`);

// 200: el reenvío devuelve el reclamo que ya existía.
const reenvio = await registrarReclamo(sesion, { ...base, avisos: 'api' });
comprobar('Reenviar el mismo texto', '200: tipo reenvio, el mismo id y el mismo creadoEn',
  `${reenvio.tipo}; ${reenvio.reclamo.id}`,
  reenvio.tipo === 'reenvio' && reenvio.reclamo.id === creado.reclamo.id
    && reenvio.reclamo.creadoEn.getTime() === creado.reclamo.creadoEn.getTime());

// Errores del contrato, con su código estable.
const casos: [string, () => Promise<unknown>, number, string][] = [
  ['Descripción de 5 001 caracteres', () => registrarReclamo(sesion, { ...base, descripcion: 'a'.repeat(5001) }), 400, 'DESCRIPCION_DEMASIADO_LARGA'],
  ['Código UNI mal escrito', () => registrarReclamo(sesion, { ...base, descripcion: `${marca} UNI`, codigoEstudiante: '2024A' }), 400, 'CODIGO_UNI_INVALIDO'],
  ['Falta la categoría', () => registrarReclamo(sesion, { categoria: '', descripcion: 'x' }), 400, 'DATOS_INCOMPLETOS'],
  ['Documento de otro estudiante', () => registrarReclamo(sesion, { ...base, descripcion: `${marca} doc`, documentos: { ficha: `${URL_API}/storage/v1/object/Documentos%20Tefiis/otra-persona_uni_pe/ficha.pdf` } }), 403, 'DOCUMENTO_AJENO'],
  ['Sin sesión', () => registrarReclamo(api(), base), 401, 'SESION_REQUERIDA'],
  ['Token falsificado', () => registrarReclamo(api('basura'), base), 401, 'SESION_INVALIDA'],
];
for (const [caso, ejecutar, estado, codigo] of casos) {
  const e = await error(ejecutar());
  comprobar(caso, `${estado} ${codigo}`, e ? `${e.estado} ${e.codigo}` : 'no lanzó ErrorDeApi', e?.estado === estado && e.codigo === codigo);
}

// Lo que el generador no modela: el método generado lee el 201 con el tipo del 200.
const generado = await sesion.registrarReclamo({ nuevoReclamo: { ...base, descripcion: `${marca} generado` } });
comprobar('registrarReclamo() generado, sobre un 201', 'solo id y creadoEn: pierde estado y cursosDescartados (por eso existe ./reclamos.ts)',
  `claves: ${Object.keys(generado).join(', ')}`, !('estado' in generado) && !('cursosDescartados' in generado));

for (const r of resultados) console.log(`${r.ok ? 'OK ' : 'MAL'} ${r.caso}: esperado ${r.esperado} | obtenido ${r.obtenido}`);
const bien = resultados.filter((r) => r.ok).length;
console.log(`\n${bien} de ${resultados.length} correctos.`);
// Sin process.exit: en Windows corta las conexiones de fetch todavía abiertas y Node aborta con un error de libuv.
process.exitCode = bien === resultados.length ? 0 : 1;
