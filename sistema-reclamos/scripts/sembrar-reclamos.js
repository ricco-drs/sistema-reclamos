// Siembra los 1 500 reclamos de ejemplo para el escenario de rendimiento de la
// bandeja del panel del Tercio (E2) y permite limpiarlos al terminar las pruebas.
//
// Usa el mismo formato de correo que pruebas/generar-tokens.js:
//   estudiante-001@prueba.test .. estudiante-200@prueba.test
// Así todos los reclamos sembrados pertenecen a estudiantes que ya tienen token
// en pruebas/tokens.json, y limpiar la base después de las pruebas se reduce a
// borrar las filas con email LIKE '%@prueba.test' (en PostgREST: email=like.*@prueba.test).
//
// Uso, desde sistema-reclamos/:
//   node --env-file=<.env de Compose> scripts/sembrar-reclamos.js
//   node --env-file=<.env de Compose> scripts/sembrar-reclamos.js --cantidad 1500 --estudiantes 200
//   node --env-file=<.env de Compose> scripts/sembrar-reclamos.js --limpiar
//   node scripts/sembrar-reclamos.js --seco --cantidad 1500
//
// Por seguridad no lee el .env de producción por su cuenta y rechaza URLs de
// *.supabase.co salvo que se pase --permitir-remoto: E2 se ejecuta siempre
// contra el PostgreSQL + PostgREST de Docker Compose, nunca contra producción.

import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const DOMINIO_PRUEBA = 'prueba.test';

const ESPECIALIDADES_FIIS = [
  'Ingeniería Industrial',
  'Ingeniería de Sistemas',
  'Ingeniería de Software',
  'Ingeniería de Inteligencia Artificial',
];

const ESTADOS_RECLAMO = [
  'PENDIENTE',
  'EN_REVISION',
  'ACEPTADO',
  'ACEPTADO_PARCIALMENTE',
  'RECHAZADO',
  'MATRICULADO',
];

const CURSOS_EJEMPLO = [
  { codigo: 'SW708', nombre: 'ARQUITECTURA DE SOLUCIONES DE SOFTWARE', seccion: 'U' },
  { codigo: 'SI505', nombre: 'INGENIERÍA DE SOFTWARE', seccion: 'U' },
  { codigo: 'FB301', nombre: 'MATEMÁTICA DISCRETA', seccion: 'V' },
  { codigo: 'IND402', nombre: 'INVESTIGACIÓN DE OPERACIONES I', seccion: 'W' },
];

const LETRAS_CODIGO = 'ABCDEFGHIJ';

/**
 * Formatea el correo de prueba con el mismo padrón que pruebas/generar-tokens.js.
 * @param {number} indice 1..estudiantes
 * @param {number} totalEstudiantes
 */
export function correoEstudiantePrueba(indice, totalEstudiantes = 200) {
  const ancho = Math.max(3, String(totalEstudiantes).length);
  return `estudiante-${String(indice).padStart(ancho, '0')}@${DOMINIO_PRUEBA}`;
}

/**
 * Genera en memoria las filas listas para insertar en `public.reclamos`.
 *
 * @param {Object} [opciones]
 * @param {number} [opciones.cantidad] Total de reclamos a sembrar (por defecto 1 500 para E2).
 * @param {number} [opciones.estudiantes] Total de estudiantes con token entre los que se reparten (por defecto 200).
 * @param {number} [opciones.desdeNumero] Número inicial para el id `REC-AAAA-NNNN` (por defecto 1001).
 * @param {number} [opciones.anio] Año del código de reclamo (por defecto 2026).
 */
export function generarFilasReclamos({
  cantidad = 1500,
  estudiantes = 200,
  desdeNumero = 1001,
  anio = 2026,
} = {}) {
  const baseFechaMs = Date.parse(`${anio}-11-01T08:00:00.000Z`);

  return Array.from({ length: cantidad }, (_, i) => {
    const numReclamo = desdeNumero + i;
    const numEstudiante = (i % estudiantes) + 1;
    const email = correoEstudiantePrueba(numEstudiante, estudiantes);
    const id = `REC-${anio}-${String(numReclamo).padStart(4, '0')}`;
    const letra = LETRAS_CODIGO[numEstudiante % LETRAS_CODIGO.length];
    const codigo_estudiante = `2024${String(numEstudiante).padStart(4, '0')}${letra}`;
    const nombre = `PRUEBA ${String(numEstudiante).padStart(3, '0')}, ESTUDIANTE`;
    const especialidad = ESPECIALIDADES_FIIS[i % ESPECIALIDADES_FIIS.length];
    const estado = ESTADOS_RECLAMO[i % ESTADOS_RECLAMO.length];
    const cursoMatricular = CURSOS_EJEMPLO[i % CURSOS_EJEMPLO.length];
    const cursoRetirar = CURSOS_EJEMPLO[(i + 1) % CURSOS_EJEMPLO.length];
    const datosBase = {
      especialidad,
      nombre,
      codigo: codigo_estudiante,
      matriculado: i % 2 === 0,
    };

    return {
      id,
      email,
      nombre,
      codigo_estudiante,
      categoria: 'Matrícula',
      descripcion: `Reclamo sembrado #${i + 1} (${email}) para prueba de bandeja E2.`,
      datos_estudiante: {
        ...datosBase,
        cursosRetirar: [cursoRetirar],
        cursosMatricular: [cursoMatricular],
      },
      documentos: {},
      estado,
      created_at: new Date(baseFechaMs + i * 60_000).toISOString(),
      // Columnas heredadas del esquema anterior que POST /api/reclamos mantiene espejadas.
      nombres: nombre,
      codigo: codigo_estudiante,
      urls: {},
      datos_academicos: datosBase,
    };
  });
}

function crearClientePostgrest({ baseUrl, serviceKey, fetchFn = fetch }) {
  const raiz = String(baseUrl).replace(/\/+$/, '');
  const prefijo = raiz.endsWith('/rest/v1') ? raiz : `${raiz}/rest/v1`;

  return async function sbRest(ruta, opts = {}) {
    return fetchFn(`${prefijo}${ruta}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(serviceKey ? {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        } : {}),
        ...opts.headers,
      },
    });
  };
}

/**
 * Elimina todos los reclamos cuyos correos terminan en `@prueba.test`
 * (equivalente SQL: `DELETE FROM public.reclamos WHERE email LIKE '%@prueba.test'`).
 */
export async function limpiarReclamosPrueba({ baseUrl, serviceKey, fetchFn = fetch }) {
  const sbRest = crearClientePostgrest({ baseUrl, serviceKey, fetchFn });
  const patron = encodeURIComponent(`*@${DOMINIO_PRUEBA}`);
  const r = await sbRest(`/reclamos?email=like.${patron}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  if (!r.ok) {
    throw new Error(`No se pudo limpiar reclamos de @${DOMINIO_PRUEBA} (${r.status}): ${await r.text()}`);
  }
}

/**
 * Siembra los reclamos en lotes por PostgREST (`resolution=merge-duplicates` sobre `id`).
 */
export async function sembrarReclamos({
  baseUrl,
  serviceKey,
  cantidad = 1500,
  estudiantes = 200,
  desdeNumero = 1001,
  tamanoLote = 250,
  limpiarAntes = false,
  fetchFn = fetch,
}) {
  if (limpiarAntes) {
    await limpiarReclamosPrueba({ baseUrl, serviceKey, fetchFn });
  }

  const sbRest = crearClientePostgrest({ baseUrl, serviceKey, fetchFn });
  const filas = generarFilasReclamos({ cantidad, estudiantes, desdeNumero });

  for (let desde = 0; desde < filas.length; desde += tamanoLote) {
    const lote = filas.slice(desde, desde + tamanoLote);
    const r = await sbRest('/reclamos?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(lote),
    });
    if (!r.ok) {
      throw new Error(`Falló la siembra en el lote ${desde}..${desde + lote.length - 1} (${r.status}): ${await r.text()}`);
    }
  }

  return {
    sembrados: filas.length,
    estudiantesDistintos: Math.min(cantidad, estudiantes),
    primerId: filas[0]?.id ?? null,
    ultimoId: filas.at(-1)?.id ?? null,
    patronLimpiezaSql: `DELETE FROM public.reclamos WHERE email LIKE '%@${DOMINIO_PRUEBA}';`,
  };
}

function fallar(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

const esEjecucionDirecta = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (esEjecucionDirecta) {
  const { values: opciones } = parseArgs({
    options: {
      cantidad: { type: 'string', default: '1500' },
      estudiantes: { type: 'string', default: '200' },
      'desde-numero': { type: 'string', default: '1001' },
      lote: { type: 'string', default: '250' },
      limpiar: { type: 'boolean', default: false },
      seco: { type: 'boolean', default: false },
      'permitir-remoto': { type: 'boolean', default: false },
    },
  });

  const cantidad = Number(opciones.cantidad);
  const estudiantes = Number(opciones.estudiantes);
  const desdeNumero = Number(opciones['desde-numero']);
  const tamanoLote = Number(opciones.lote);

  if (!Number.isInteger(cantidad) || cantidad < 1) {
    fallar('--cantidad debe ser un entero mayor o igual que 1.');
  }
  if (!Number.isInteger(estudiantes) || estudiantes < 1) {
    fallar('--estudiantes debe ser un entero mayor o igual que 1.');
  }

  if (opciones.seco) {
    const filas = generarFilasReclamos({ cantidad, estudiantes, desdeNumero });
    console.log(`[Modo seco] Generadas ${filas.length} filas en memoria para ${Math.min(cantidad, estudiantes)} estudiantes (${filas[0].email} .. ${correoEstudiantePrueba(Math.min(cantidad, estudiantes), estudiantes)}).`);
    console.log(`Rango de IDs: ${filas[0].id} .. ${filas.at(-1).id}`);
    console.log(`Consulta de limpieza SQL: DELETE FROM public.reclamos WHERE email LIKE '%@${DOMINIO_PRUEBA}';`);
    process.exit(0);
  }

  const baseUrl = process.env.SUPABASE_URL || process.env.POSTGREST_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || '';

  if (!baseUrl) {
    fallar('Falta SUPABASE_URL (o POSTGREST_URL). Ejecuta contra el entorno de Docker Compose:\n'
      + '  node --env-file=<.env de Compose> scripts/sembrar-reclamos.js');
  }

  if (/\.supabase\.co\b/i.test(baseUrl) && !opciones['permitir-remoto']) {
    fallar(`SUPABASE_URL apunta a Supabase en la nube (${baseUrl}). E2 nunca debe correr contra producción.\n`
      + 'Usa la URL del PostgREST de Docker Compose (por ejemplo http://localhost:3000).');
  }

  if (opciones.limpiar) {
    await limpiarReclamosPrueba({ baseUrl, serviceKey });
    console.log(`Limpieza completada: eliminados los reclamos con email LIKE '%@${DOMINIO_PRUEBA}'.`);
    process.exit(0);
  }

  const resumen = await sembrarReclamos({
    baseUrl,
    serviceKey,
    cantidad,
    estudiantes,
    desdeNumero,
    tamanoLote,
    limpiarAntes: true,
  });

  console.log(`Sembrados ${resumen.sembrados} reclamos (${resumen.primerId} .. ${resumen.ultimoId}) repartidos entre ${resumen.estudiantesDistintos} estudiantes (@${DOMINIO_PRUEBA}).`);
  console.log(`Para limpiar después de las pruebas: node --env-file=<.env de Compose> scripts/sembrar-reclamos.js --limpiar`);
}
