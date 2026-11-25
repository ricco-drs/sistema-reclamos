// Genera las interfaces TypeScript de la API desde el contrato docs/api/openapi.yaml con
// openapi-generator (Lab10, paso 4), o comprueba que las que están en el repositorio
// corresponden al contrato actual.
//
// Uso, desde sistema-reclamos/ (hace falta Java 11 o superior y red la primera vez, para bajar
// el generador):
//   npm run api:generar     escribe src/api/generado/; si el generador falla, deja el que había
//   npm run api:verificar   falla si src/api/generado/ no coincide con el contrato
//
// Las versiones quedan fijas para que el resultado sea el mismo en cualquier máquina:
//   - el envoltorio de npm, abajo (VERSION_ENVOLTORIO);
//   - el generador, en openapitools.json ("generator-cli": { "version": ... }).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRATO = path.resolve(RAIZ, '..', 'docs', 'api', 'openapi.yaml');
const DESTINO = path.join(RAIZ, 'src', 'api', 'generado');

const VERSION_ENVOLTORIO = '2.21.0';
// withInterfaces: además de las clases, una interfaz por grupo de operaciones.
// useSingleRequestParameter: cada operación recibe un solo objeto con sus parámetros.
const PROPIEDADES = 'withInterfaces=true,supportsES6=true,typescriptThreePlus=true,useSingleRequestParameter=true';

function fallar(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

function comprobarJava() {
  const r = spawnSync('java', ['-version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    fallar('openapi-generator necesita Java 11 o superior y no se encontró `java` en el PATH.');
  }
}

// Escribe en `salida`, que está vacía o no existe. Si el generador falla lanza un Error en vez de
// salir con process.exit, que se saltaría los `finally` que borran las carpetas temporales.
function generar(salida) {
  // Una sola cadena y con shell: en Windows `npx` es un .cmd y no se puede lanzar sin shell.
  const comando = [
    'npx --yes', `@openapitools/openapi-generator-cli@${VERSION_ENVOLTORIO}`,
    'generate', '-i', `"${CONTRATO}"`, '-g typescript-fetch', '-o', `"${salida}"`,
    `--additional-properties=${PROPIEDADES}`,
  ].join(' ');
  const r = spawnSync(comando, { cwd: RAIZ, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`openapi-generator falló (código ${r.status}):\n${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  }
  const avisos = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').filter((l) => /WARN|ERROR/.test(l));
  return avisos.map((l) => l.replace(/\u001b\[[0-9;]*m/g, '').replace(/^\[main\]\s*/, '').trim());
}

function archivosDe(dir) {
  const lista = [];
  (function recorrer(actual) {
    for (const e of fs.readdirSync(actual, { withFileTypes: true })) {
      const ruta = path.join(actual, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else lista.push(path.relative(dir, ruta).replace(/\\/g, '/'));
    }
  })(dir);
  return lista.sort();
}

// Git puede convertir los saltos de línea al sacar el archivo; no importan para comparar.
const leer = (ruta) => fs.readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');

function diferencias(esperado, actual) {
  const a = archivosDe(esperado);
  const b = fs.existsSync(actual) ? archivosDe(actual) : [];
  const problemas = [];
  for (const f of a) if (!b.includes(f)) problemas.push(`falta ${f}`);
  for (const f of b) if (!a.includes(f)) problemas.push(`sobra ${f}`);
  for (const f of a) {
    if (b.includes(f) && leer(path.join(esperado, f)) !== leer(path.join(actual, f))) problemas.push(`distinto ${f}`);
  }
  return problemas;
}

// Genera en una carpeta temporal y reemplaza `destino` solo si el generador termina bien. La temporal
// va junto a `destino`, en el mismo disco, para que el cambio sea un renombrado y no una copia que
// pueda quedar a medias.
function generarYReemplazar(destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const temporal = fs.mkdtempSync(path.join(path.dirname(destino), '.generando-'));
  try {
    const nuevo = path.join(temporal, 'nuevo');
    const anterior = path.join(temporal, 'anterior');
    const avisos = generar(nuevo);
    if (fs.existsSync(destino)) fs.renameSync(destino, anterior);
    try {
      fs.renameSync(nuevo, destino);
    } catch (error) {
      if (fs.existsSync(anterior)) fs.renameSync(anterior, destino);
      throw error;
    }
    return avisos;
  } finally {
    fs.rmSync(temporal, { recursive: true, force: true });
  }
}

function verificar() {
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'interfaces-api-'));
  try {
    generar(temporal);
    const problemas = diferencias(temporal, DESTINO);
    if (problemas.length) {
      throw new Error(`src/api/generado/ no corresponde a docs/api/openapi.yaml (${problemas.length} diferencias):\n`
        + `${problemas.slice(0, 15).map((p) => `  - ${p}`).join('\n')}\nCorre \`npm run api:generar\` y sube el resultado.`);
    }
    console.log(`Las interfaces de src/api/generado/ corresponden al contrato (${archivosDe(DESTINO).length} archivos).`);
  } finally {
    fs.rmSync(temporal, { recursive: true, force: true });
  }
}

comprobarJava();
if (!fs.existsSync(CONTRATO)) fallar(`No se encontró el contrato en ${CONTRATO}.`);

try {
  if (process.argv.includes('--verificar')) {
    verificar();
  } else {
    const avisos = generarYReemplazar(DESTINO);
    console.log(`Interfaces generadas en src/api/generado/ (${archivosDe(DESTINO).length} archivos).`);
    if (avisos.length) {
      console.log(`Avisos del generador (${avisos.length}):`);
      for (const a of [...new Set(avisos)]) console.log(`  - ${a}`);
    }
  }
} catch (error) {
  fallar(error.message);
}
