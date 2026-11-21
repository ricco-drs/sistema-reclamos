// Valida docs/api/openapi.yaml contra sí mismo y contra el código, sin red ni
// paquetes nuevos: usa js-yaml y ajv, que ya instala npm ci.
//
// Uso, desde sistema-reclamos/:  node pruebas/validar-openapi.cjs [otro.yaml]
//
// Comprueba que el YAML se lea, que toda $ref resuelva, que cada operación
// tenga operationId único y sus parámetros de ruta, que cada ejemplo cumpla
// su esquema, que las rutas coincidan con las de server.js y que cada mensaje
// de error de los ejemplos exista tal cual en el código.
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const raiz = path.resolve(__dirname, '..', '..');
const req = createRequire(path.join(raiz, 'sistema-reclamos', 'package.json'));
const yaml = req('js-yaml');
const Ajv = req('ajv');

const problemas = [];
const fallo = (m) => problemas.push(m);

// 1. Parseo
const doc = yaml.load(fs.readFileSync(process.argv[2] || path.join(raiz, 'docs/api/openapi.yaml'), 'utf8'));
if (doc.openapi !== '3.0.3') fallo(`openapi es ${doc.openapi}`);

// 2. Todas las $ref internas resuelven
const resolver = (ref) => ref.slice(2).split('/').reduce((o, k) => (o == null ? o : o[k.replace(/~1/g, '/').replace(/~0/g, '~')]), doc);
let refs = 0;
(function recorrer(n, donde) {
  if (Array.isArray(n)) return n.forEach((x, i) => recorrer(x, `${donde}[${i}]`));
  if (n && typeof n === 'object') {
    if (typeof n.$ref === 'string') {
      refs++;
      if (!n.$ref.startsWith('#/') || resolver(n.$ref) === undefined) fallo(`$ref rota en ${donde}: ${n.$ref}`);
    }
    for (const [k, v] of Object.entries(n)) recorrer(v, `${donde}.${k}`);
  }
})(doc, '$');

const deref = (o) => (o && o.$ref ? deref(resolver(o.$ref)) : o);

// 3. Estructura de operaciones
const METODOS = ['get', 'post', 'put', 'patch', 'delete'];
const tags = new Set((doc.tags || []).map((t) => t.name));
const ids = new Set();
const operaciones = [];
for (const [ruta, item] of Object.entries(doc.paths)) {
  for (const m of METODOS) {
    const op = item[m];
    if (!op) continue;
    operaciones.push(`${m.toUpperCase()} ${ruta}`);
    if (!op.operationId) fallo(`${m} ${ruta}: sin operationId`);
    else if (ids.has(op.operationId)) fallo(`operationId repetido: ${op.operationId}`);
    ids.add(op.operationId);
    (op.tags || []).forEach((t) => tags.has(t) || fallo(`${m} ${ruta}: tag desconocido ${t}`));
    if (!op.responses || !Object.keys(op.responses).length) fallo(`${m} ${ruta}: sin respuestas`);
    const enRuta = [...ruta.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
    const declarados = [...(item.parameters || []), ...(op.parameters || [])].map(deref)
      .filter((p) => p.in === 'path').map((p) => p.name).sort();
    if (enRuta.join() !== declarados.join()) fallo(`${m} ${ruta}: parámetros de ruta ${enRuta} vs declarados ${declarados}`);
  }
}

// 4. Ejemplos contra esquemas (OpenAPI 3.0 -> JSON Schema draft-07)
function convertir(s) {
  if (Array.isArray(s)) return s.map(convertir);
  if (!s || typeof s !== 'object') return s;
  const out = {};
  for (const [k, v] of Object.entries(s)) {
    if (['example', 'deprecated', 'nullable'].includes(k)) continue;
    if (k === '$ref') { out.$ref = `doc${v}`; continue; }
    out[k] = ['properties'].includes(k)
      ? Object.fromEntries(Object.entries(v).map(([p, ps]) => [p, convertir(ps)]))
      : convertir(v);
  }
  if (s.nullable) {
    if (out.type) out.type = [out.type, 'null'];
    else return { anyOf: [out, { type: 'null' }] };
  }
  return out;
}
const ajv = new Ajv({ allErrors: true });
ajv.addSchema({ components: { schemas: convertir(doc.components.schemas) } }, 'doc');

let ejemplos = 0;
function probar(schema, valor, donde) {
  ejemplos++;
  let validar;
  try { validar = ajv.compile(convertir(schema)); }
  catch (err) { fallo(`esquema que no compila en ${donde}: ${err.message}`); return; }
  if (!validar(valor)) fallo(`ejemplo inválido en ${donde}: ${ajv.errorsText(validar.errors)}`);
}
function probarMedios(content, donde) {
  for (const [tipo, media] of Object.entries(content || {})) {
    if (!media.schema) continue;
    if ('example' in media) probar(media.schema, media.example, `${donde} ${tipo}`);
    for (const [n, e] of Object.entries(media.examples || {})) probar(media.schema, deref(e).value, `${donde} ${tipo} examples.${n}`);
  }
}
for (const [ruta, item] of Object.entries(doc.paths)) {
  for (const m of METODOS) {
    const op = item[m];
    if (!op) continue;
    const donde = `${m.toUpperCase()} ${ruta}`;
    if (op.requestBody) probarMedios(deref(op.requestBody).content, `${donde} cuerpo`);
    for (const [codigo, r] of Object.entries(op.responses)) probarMedios(deref(r).content, `${donde} ${codigo}`);
    for (const p of (op.parameters || []).map(deref)) if ('example' in p) probar(p.schema, p.example, `${donde} parámetro ${p.name}`);
  }
}
for (const [n, r] of Object.entries(doc.components.responses)) probarMedios(r.content, `components.responses.${n}`);
for (const [n, p] of Object.entries(doc.components.parameters)) if ('example' in p) probar(p.schema, p.example, `components.parameters.${n}`);

// 5. Rutas del contrato contra server.js
const servidor = fs.readFileSync(path.join(raiz, 'sistema-reclamos/backend/server.js'), 'utf8');
const enCodigo = [...servidor.matchAll(/app\.(get|post|put|patch|delete)\('(\/api\/[^']+)'/g)]
  .filter(([, , r]) => r.startsWith('/api/admin/') || r === '/api/reclamos')
  .filter(([m, , r]) => r !== '/api/reclamos' || m.includes('post'))
  .map(([, m, r]) => `${m.toUpperCase()} ${r.replace(/:(\w+)/g, '{$1}')}`);
const faltan = enCodigo.filter((o) => !operaciones.includes(o));
const sobran = operaciones.filter((o) => !enCodigo.includes(o));
if (faltan.length) fallo(`rutas del código que no están en el contrato: ${faltan.join(', ')}`);
if (sobran.length) fallo(`rutas del contrato que no están en el código: ${sobran.join(', ')}`);

// 6. Cada mensaje de error de los ejemplos existe en el código.
// Se lee todo backend/ menos tests/: los mensajes cambian de archivo cuando una
// ruta se mueve a su caso de uso, y el contrato no tiene por qué fallar por eso.
function archivosJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'tests' || e.name === 'node_modules' ? [] : archivosJs(ruta);
    return e.name.endsWith('.js') ? [ruta] : [];
  });
}
const codigo = archivosJs(path.join(raiz, 'sistema-reclamos/backend'))
  .map((f) => fs.readFileSync(f, 'utf8')).join('\n');
// Un cuerpo de error es { error } en las rutas del panel y { codigo, error } en
// POST /api/reclamos. Los ejemplos con `x-pendiente` llevan mensajes que el
// código todavía no devuelve (su issue no entró): se cuentan, pero no se exigen.
const mensajes = new Set();
const pendientes = new Set();
const esCuerpoDeError = (n) => typeof n.error === 'string'
  && Object.keys(n).every((k) => k === 'error' || k === 'codigo');
(function juntar(n, pendiente) {
  if (Array.isArray(n)) return n.forEach((x) => juntar(x, pendiente));
  if (n && typeof n === 'object') {
    const marca = pendiente || n['x-pendiente'];
    if (esCuerpoDeError(n)) (marca ? pendientes : mensajes).add(n.error);
    Object.values(n).forEach((x) => juntar(x, marca));
  }
})(doc, null);
// Algunos mensajes se arman con una plantilla en el código; se buscan también así.
const enElCodigo = (msg) => [
  msg,
  msg.replace(/"(matricular|desmatricular)"/g, '"${campo}"').replace(/: https:\/\/\S+$/, ': ${storedUrl}'),
  msg.replace('de 5000 caracteres', 'de ${MAX_DESCRIPCION} caracteres'),
].some((m) => codigo.includes(m));

for (const msg of mensajes) {
  if (!enElCodigo(msg)) fallo(`mensaje que no está en el código: ${msg}`);
}

for (const msg of pendientes) {
  if (enElCodigo(msg)) fallo(`mensaje marcado x-pendiente que ya está en el código (quitar la marca): ${msg}`);
}

console.log(`operaciones: ${operaciones.length} (en server.js: ${enCodigo.length}) | $ref: ${refs} | ejemplos validados: ${ejemplos} | mensajes de error comprobados: ${mensajes.size} | pendientes de implementar: ${pendientes.size}`);
if (problemas.length) {
  console.log(`\n${problemas.length} problemas:`);
  problemas.forEach((p) => console.log(` - ${p}`));
  process.exit(1);
}
console.log('Sin problemas.');
