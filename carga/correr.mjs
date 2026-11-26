// Corre carga/escenario.js varias veces seguidas y guarda, por corrida, lo que
// el Lab12 pide para comparar el antes y el después (ver carga/README.md):
//
//   <etiqueta>-<n>-k6.txt / -k6.json   resumen de k6 (p95, solicitudes/s, errores)
//   <etiqueta>-<n>-docker-stats.csv    CPU y memoria de cada contenedor durante la carga
//   <etiqueta>-<n>-postgrest.csv       tiempos de cada consulta de la bandeja en PostgREST
//   <etiqueta>-entorno.json            máquina, Docker, commit e imágenes
//   <etiqueta>-resumen.md              la tabla de todas las corridas
//
// Uso, desde la raíz del repositorio, con el Compose de medición levantado y sembrado:
//   node carga/correr.mjs --etiqueta antes
//   node carga/correr.mjs --etiqueta despues
//
// Con --resumir no se mide: rehace los tiempos de PostgREST y el resumen de
// corridas ya hechas, leyendo otra vez el registro de nginx de cada ventana.
//
// La primera corrida se descarta en el resumen: el sistema todavía está frío.
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    etiqueta: { type: 'string' },
    corridas: { type: 'string', default: '3' },
    resumir: { type: 'boolean', default: false },
  },
});
if (!args.etiqueta || !/^[a-z0-9-]+$/.test(args.etiqueta)) {
  console.error('Uso: node carga/correr.mjs --etiqueta antes|despues [--corridas 3]');
  process.exit(2);
}
const CORRIDAS = Number(args.corridas);
const COMPOSE = ['compose', '-f', 'compose.yaml', '-f', 'carga/compose.yaml'];
const SALIDA = path.join('docs', 'mediciones', 'corridas');
// Prefijo de la consulta de la bandeja: después de la mejora el orden lleva además
// el id (`order=created_at.desc,id.desc`) y se pide por páginas.
const RUTA_BANDEJA = '/rest/v1/reclamos?select=*&order=created_at.desc';
mkdirSync(SALIDA, { recursive: true });

const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8' }).trim();
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const archivo = (nombre) => path.join(SALIDA, `${args.etiqueta}-${nombre}`);

// La máquina y el código con que se midió: sin esto el antes y el después no se pueden comparar.
function registrarEntorno() {
  const info = JSON.parse(docker('info', '--format', '{{json .}}'));
  const imagenes = docker(...COMPOSE, 'images', '--format', 'json');
  const entorno = {
    fecha: new Date().toISOString(),
    commit: git('rev-parse', 'HEAD'),
    rama: git('rev-parse', '--abbrev-ref', 'HEAD'),
    cambiosSinCommit: git('status', '--porcelain', '--untracked-files=no') || null,
    maquina: {
      procesador: os.cpus()[0]?.model.trim(),
      nucleosLogicos: os.cpus().length,
      memoriaGB: +(os.totalmem() / 2 ** 30).toFixed(1),
      sistema: `${os.type()} ${os.release()}`,
    },
    docker: {
      version: info.ServerVersion,
      cpusAsignadas: info.NCPU,
      memoriaAsignadaGB: +(info.MemTotal / 2 ** 30).toFixed(1),
      sistema: info.OperatingSystem,
    },
    imagenes: imagenes ? JSON.parse(imagenes.startsWith('[') ? imagenes : `[${imagenes.split('\n').join(',')}]`)
      .map((i) => `${i.ContainerName}: ${i.Repository}:${i.Tag} ${i.ID?.slice(0, 19) ?? ''}`.trim()) : [],
  };
  writeFileSync(archivo('entorno.json'), `${JSON.stringify(entorno, null, 2)}\n`);
  return entorno;
}

// docker stats en continuo mientras corre k6: una fila por contenedor y muestra.
function capturarStats(destino, proyectoCompose) {
  const prefijo = proyectoCompose + '-';
  const csv = createWriteStream(destino);
  csv.write('hora,contenedor,cpu_pct,memoria_mib\n');
  const proc = spawn('docker', ['stats', '--format', '{{json .}}']);
  let resto = '';
  proc.stdout.on('data', (trozo) => {
    // Sin terminal, docker stats separa cada refresco con secuencias ANSI.
    const lineas = (resto + trozo.toString()).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '\n').split('\n');
    resto = lineas.pop();
    const hora = new Date().toISOString();
    for (const linea of lineas) {
      if (!linea.trim().startsWith('{')) continue;
      const s = JSON.parse(linea);
      if (!s.Name.startsWith(prefijo)) continue;
      const [usada] = s.MemUsage.split('/');
      const mib = parseFloat(usada) * ({ KiB: 1 / 1024, MiB: 1, GiB: 1024, B: 1 / 2 ** 20 }[usada.trim().replace(/[\d.]/g, '')] ?? 1);
      // sistema-reclamos-api-1 → api; sistema-reclamos-k6-run-3f2a… → k6
      const contenedor = s.Name.slice(prefijo.length).replace(/-run-\w+$/, '').replace(/-\d+$/, '');
      csv.write(`${hora},${contenedor},${parseFloat(s.CPUPerc)},${mib.toFixed(1)}\n`);
    }
  });
  return () => new Promise((listo) => { proc.kill(); csv.end(listo); });
}

function correrK6(n) {
  return new Promise((listo) => {
    const txt = createWriteStream(archivo(`${n}-k6.txt`));
    const k6 = spawn('docker', [...COMPOSE, 'run', '--rm', 'k6', 'run',
      '--summary-export', `/resultados/${args.etiqueta}-${n}-k6.json`, '/carga/escenario.js'],
    { env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
    for (const flujo of [k6.stdout, k6.stderr]) {
      flujo.on('data', (d) => { process.stdout.write(d); txt.write(d); });
    }
    // k6 sale con 99 cuando no se cumple un umbral: es un resultado, no un fallo.
    k6.on('close', (codigo) => txt.end(() => listo(codigo)));
  });
}

// Tiempos de PostgREST que registra nginx (carga/rest.conf), solo de la consulta de la bandeja.
function guardarTiemposPostgrest(desde, hasta, destino) {
  const log = docker(...COMPOSE, 'logs', 'rest', '--no-log-prefix', '--since', desde, '--until', hasta);
  const filas = log.split('\n').filter((l) => l.includes(`"${RUTA_BANDEJA}`)).map((l) => {
    const [hora, estado, totalNginx, postgrest, bytes] = l.split(' ');
    const transaccion = /transaction;dur=([\d.]+)/.exec(l)?.[1] ?? '';
    return `${hora},${estado},${+totalNginx * 1000},${+postgrest * 1000},${transaccion},${bytes}`;
  });
  writeFileSync(destino, `hora,estado,nginx_ms,postgrest_ms,transaccion_bd_ms,bytes\n${filas.join('\n')}\n`);
}

const percentil = (xs, p) => {
  if (!xs.length) return NaN;
  const o = [...xs].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.ceil((p / 100) * o.length) - 1)];
};
const promedio = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const leerCsv = (f) => {
  const [cab, ...filas] = readFileSync(f, 'utf8').trim().split('\n');
  const campos = cab.split(',');
  return filas.map((l) => Object.fromEntries(l.split(',').map((v, i) => [campos[i], v])));
};
const num = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');

function resumirCorrida(n) {
  const k = JSON.parse(readFileSync(archivo(`${n}-k6.json`), 'utf8')).metrics;
  const dur = k['http_req_duration{escenario:bandeja}'];
  const reqs = k['http_reqs{escenario:bandeja}'];
  const fallidas = k['http_req_failed{escenario:bandeja}'];
  const stats = leerCsv(archivo(`${n}-docker-stats.csv`));
  const pg = leerCsv(archivo(`${n}-postgrest.csv`));
  const cpu = (c) => stats.filter((s) => s.contenedor === c).map((s) => +s.cpu_pct);
  return {
    n,
    p95: dur['p(95)'], mediana: dur.med, max: dur.max,
    rps: reqs.rate, solicitudes: reqs.count,
    errores: fallidas.value * 100,
    faltantesMax: k.reclamos_faltantes.max,
    cpu: Object.fromEntries(['api', 'rest', 'postgrest', 'db', 'firebase-auth', 'k6']
      .map((c) => [c, { media: promedio(cpu(c)), max: Math.max(...cpu(c)) }])),
    pgP95: percentil(pg.map((f) => +f.postgrest_ms), 95),
    bdP95: percentil(pg.map((f) => +f.transaccion_bd_ms), 95),
    // Bytes que PostgREST le manda a la API por cada apertura de la bandeja, sumando las páginas.
    bytes: pg.reduce((a, f) => a + +f.bytes, 0) / reqs.count,
    consultasPorPeticion: pg.length / reqs.count,
  };
}

function escribirResumen(entorno, corridas) {
  const fila = (c) => `| ${c.n}${c.n === 1 ? ' (descartada)' : ''} | ${num(c.p95)} | ${num(c.mediana)} | ${num(c.rps, 2)} | ${num(c.errores, 2)} % | ${c.faltantesMax} | ${num(c.pgP95)} | ${num(c.bdP95)} |`;
  const cpu = (c) => `| ${c.n} | ${Object.values(c.cpu).map((v) => `${num(v.media)} / ${num(v.max)}`).join(' | ')} |`;
  const md = `# Corridas «${args.etiqueta}» de E2

Generado por \`node carga/correr.mjs --etiqueta ${args.etiqueta}\` el ${entorno.fecha}.

- **Commit medido:** \`${entorno.commit}\` (rama \`${entorno.rama}\`)${entorno.cambiosSinCommit ? ', **con cambios sin commit**' : ''}.
- **Máquina:** ${entorno.maquina.procesador}, ${entorno.maquina.nucleosLogicos} núcleos lógicos, ${entorno.maquina.memoriaGB} GB, ${entorno.maquina.sistema}.
- **Docker:** ${entorno.docker.version}, ${entorno.docker.cpusAsignadas} CPU y ${entorno.docker.memoriaAsignadaGB} GB asignados (${entorno.docker.sistema}).
- **Carga:** \`carga/escenario.js\`, 10 usuarios virtuales durante 3 minutos con 1 s de pausa, dentro de la red de Compose.
- **Respuesta de la bandeja:** ${num(corridas.at(-1).bytes / 1000, 0)} KB de PostgREST a la API por cada apertura, en ${num(corridas.at(-1).consultasPorPeticion, 2)} consultas.

## k6 y PostgREST

| Corrida | p95 (ms) | Mediana (ms) | Solicitudes/s | Errores | Faltantes (máx.) | PostgREST p95 (ms) | Base p95 (ms) |
|---|---|---|---|---|---|---|---|
${corridas.map(fila).join('\n')}

«PostgREST» es lo que tardó PostgREST en cada consulta de la bandeja, medido por nginx (si la bandeja pide por páginas, cada página es una consulta); «Base» es la transacción en PostgreSQL, según PostgREST (\`Server-Timing\`).

## CPU de cada contenedor durante la carga (% medio / % máximo)

100 % es un núcleo entero.

| Corrida | api | rest | postgrest | db | firebase-auth | k6 |
|---|---|---|---|---|---|---|
${corridas.map(cpu).join('\n')}
`;
  writeFileSync(archivo('resumen.md'), md);
  console.log(`\n${md}`);
}

const corridas = [];
if (args.resumir) {
  const entorno = JSON.parse(readFileSync(archivo('entorno.json'), 'utf8'));
  for (let n = 1; n <= CORRIDAS; n++) {
    // La ventana de cada corrida es la de su captura de docker stats.
    const horas = leerCsv(archivo(`${n}-docker-stats.csv`)).map((f) => f.hora);
    guardarTiemposPostgrest(horas[0], horas.at(-1), archivo(`${n}-postgrest.csv`));
    corridas.push(resumirCorrida(n));
  }
  escribirResumen(entorno, corridas);
} else {
  const proyectoCompose = JSON.parse(docker(...COMPOSE, 'config', '--format', 'json')).name;
  const entorno = registrarEntorno();
  for (let n = 1; n <= CORRIDAS; n++) {
    console.log(`\n=== Corrida ${n} de ${CORRIDAS} («${args.etiqueta}») ===`);
    const desde = new Date().toISOString();
    const pararStats = capturarStats(archivo(`${n}-docker-stats.csv`), proyectoCompose);
    const codigo = await correrK6(n).finally(pararStats);
    if (codigo !== 0 && codigo !== 99) {
      throw new Error(`k6 terminó la corrida ${n} con código ${codigo}. Revisa ${archivo(`${n}-k6.txt`)}.`);
    }
    guardarTiemposPostgrest(desde, new Date().toISOString(), archivo(`${n}-postgrest.csv`));
    corridas.push(resumirCorrida(n));
  }
  escribirResumen(entorno, corridas);
}
