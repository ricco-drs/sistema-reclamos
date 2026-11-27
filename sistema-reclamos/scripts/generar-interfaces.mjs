// Genera las interfaces TypeScript de la API desde el contrato docs/api/openapi.yaml con
// openapi-generator (Lab10, paso 4), o comprueba que las que están en el repositorio
// corresponden al contrato actual.
//
// Uso, desde sistema-reclamos/ (hace falta Java 11 o superior y red la primera vez, para bajar
// el generador):
//   npm run api:generar     escribe src/api/generado/; si el generador falla, deja el que había
//   npm run api:verificar   falla si src/api/generado/ no coincide con el contrato
//
// Se ejecuta el .jar de openapi-generator con `java -jar`, sin el envoltorio de npm
// (@openapitools/openapi-generator-cli), que en una máquina del equipo se quedaba colgado sin
// mostrar nada. Si el .jar falta, se descarga de Maven Central a ~/.cache/openapi-generator/.
// La versión y su suma SHA-256 quedan fijas abajo, para que el resultado sea el mismo en cualquier
// máquina y no se ejecute una descarga incompleta o distinta. Al cambiar de versión se cambian las dos.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTRATO = path.resolve(RAIZ, '..', 'docs', 'api', 'openapi.yaml');
const DESTINO = path.join(RAIZ, 'src', 'api', 'generado');

const VERSION_GENERADOR = '7.14.0';
// Calculada sobre el .jar de Maven Central, cuyo SHA-1 coincide con el que publica Maven.
const SHA256_GENERADOR = 'e03186835022ca02da4aa95e3967b6a3b6d44c2e5f7606e6d5c22466f519c757';
const NOMBRE_JAR = `openapi-generator-cli-${VERSION_GENERADOR}.jar`;
const URL_JAR = `https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/${VERSION_GENERADOR}/${NOMBRE_JAR}`;
const RUTA_JAR = path.join(os.homedir(), '.cache', 'openapi-generator', NOMBRE_JAR);
// Ninguna espera queda sin límite: al vencer se corta con un mensaje.
const ESPERA_DESCARGA_MS = 5 * 60_000;
const ESPERA_GENERADOR_MS = 5 * 60_000;
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

const esElEsperado = (contenido) => createHash('sha256').update(contenido).digest('hex') === SHA256_GENERADOR;

// Devuelve la ruta del .jar. Si no está, o el que hay no es el esperado, lo descarga. Se escribe con
// otro nombre y se renombra al final, para que una descarga cortada no deje un .jar a medias.
async function obtenerJar() {
  if (fs.existsSync(RUTA_JAR) && esElEsperado(fs.readFileSync(RUTA_JAR))) return RUTA_JAR;
  console.log(`Descargando openapi-generator ${VERSION_GENERADOR} (unos 30 MB) de Maven Central; solo hace falta una vez...`);
  const aMano = `Puedes descargarlo a mano de ${URL_JAR} y dejarlo en ${RUTA_JAR}.`;
  let contenido;
  try {
    const respuesta = await fetch(URL_JAR, { signal: AbortSignal.timeout(ESPERA_DESCARGA_MS) });
    if (!respuesta.ok) throw new Error(`Maven respondió ${respuesta.status}`);
    contenido = Buffer.from(await respuesta.arrayBuffer());
  } catch (error) {
    throw new Error(`No se pudo descargar openapi-generator: ${error.cause?.message ?? error.message}.\n${aMano}`);
  }
  if (!esElEsperado(contenido)) {
    throw new Error(`Lo descargado no coincide con la suma SHA-256 de openapi-generator ${VERSION_GENERADOR}; no se usa.\n${aMano}`);
  }
  fs.mkdirSync(path.dirname(RUTA_JAR), { recursive: true });
  const parcial = `${RUTA_JAR}.${process.pid}.parcial`;
  try {
    fs.writeFileSync(parcial, contenido);
    fs.renameSync(parcial, RUTA_JAR);
  } finally {
    fs.rmSync(parcial, { force: true });
  }
  return RUTA_JAR;
}

// Escribe en `salida`, que está vacía o no existe. Si el generador falla lanza un Error en vez de
// salir con process.exit, que se saltaría los `finally` que borran las carpetas temporales.
function generar(jar, salida) {
  // Los argumentos van en una lista y sin shell, así las rutas con espacios no necesitan comillas.
  // -Dfile.encoding: antes de Java 18, en Windows las tildes saldrían en otra codificación.
  const argumentos = [
    '-Dfile.encoding=UTF-8', '-jar', jar,
    'generate', '-i', CONTRATO, '-g', 'typescript-fetch', '-o', salida,
    `--additional-properties=${PROPIEDADES}`,
  ];
  const r = spawnSync('java', argumentos, {
    cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: ESPERA_GENERADOR_MS,
  });
  if (r.error) throw new Error(`No se pudo completar openapi-generator: ${r.error.message}`);
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
function generarYReemplazar(jar, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const temporal = fs.mkdtempSync(path.join(path.dirname(destino), '.generando-'));
  try {
    const nuevo = path.join(temporal, 'nuevo');
    const anterior = path.join(temporal, 'anterior');
    const avisos = generar(jar, nuevo);
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

function verificar(jar) {
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'interfaces-api-'));
  try {
    generar(jar, temporal);
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
  const jar = await obtenerJar();
  if (process.argv.includes('--verificar')) {
    verificar(jar);
  } else {
    const avisos = generarYReemplazar(jar, DESTINO);
    console.log(`Interfaces generadas en src/api/generado/ (${archivosDe(DESTINO).length} archivos).`);
    if (avisos.length) {
      console.log(`Avisos del generador (${avisos.length}):`);
      for (const a of [...new Set(avisos)]) console.log(`  - ${a}`);
    }
  }
} catch (error) {
  // Sin process.exit: en Windows, con una conexión de fetch todavía abierta, Node puede abortar.
  console.error(error.message);
  process.exitCode = 1;
}
