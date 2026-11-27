// Siembra 1 500 reclamos de prueba para medir la bandeja del Tercio (E2).
// Usa los mismos correos @prueba.test que el generador de tokens.
//
// Desde la raíz del repositorio, con el entorno de Lab11 levantado:
//   docker compose cp sistema-reclamos/scripts/sembrar-reclamos.js api:/app/scripts/sembrar-reclamos.js
//   docker compose exec -T api node scripts/sembrar-reclamos.js
//   docker compose exec -T api node scripts/sembrar-reclamos.js --limpiar
//
// Para revisar los datos sin escribir en la base:
//   node sistema-reclamos/scripts/sembrar-reclamos.js --seco
//
// La siembra conserva las filas existentes y falla si choca con algún ID.
// --limpiar solo retira las filas de la siembra E2. Conservar los reclamos
// de E1 permite verificar sus resultados incluso después de limpiar E2.

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
const PREFIJO_E2 = 'Reclamo sembrado #';
const SUFIJO_E2 = 'para prueba de bandeja E2.';

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
      descripcion: `${PREFIJO_E2}${i + 1} (${email}) ${SUFIJO_E2}`,
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

const URL_API_COMPOSE = 'http://rest:8080';
const CLAVE_COMPOSE = 'solo-laboratorio';
// La lista completa supera 1 MiB. Una solicitud directa al PostgREST interno
// permite insertar las filas en una transacción, sin el límite del proxy.
const TABLA_RECLAMOS_COMPOSE = 'http://postgrest:3000/reclamos';

function tablaDePruebas(baseUrl, serviceKey) {
  if (baseUrl !== URL_API_COMPOSE || serviceKey !== CLAVE_COMPOSE) {
    throw new Error('Ejecuta la siembra o limpieza dentro del contenedor api de Docker Compose.');
  }
  return new URL(TABLA_RECLAMOS_COMPOSE);
}

export async function limpiarReclamosPrueba({ baseUrl, serviceKey, fetchFn = fetch }) {
  const tabla = tablaDePruebas(baseUrl, serviceKey);
  tabla.searchParams.set('email', `like.*@${DOMINIO_PRUEBA}`);
  tabla.searchParams.set('and', `(descripcion.like.${PREFIJO_E2}*,descripcion.like.*${SUFIJO_E2})`);
  const respuesta = await fetchFn(tabla, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
    redirect: 'error',
  });
  if (!respuesta.ok) {
    throw new Error(`No se pudo limpiar la siembra E2 (${respuesta.status}): ${await respuesta.text()}`);
  }
}

export async function sembrarReclamos({
  baseUrl,
  serviceKey,
  cantidad = 1500,
  estudiantes = 200,
  desdeNumero = 1001,
  fetchFn = fetch,
}) {
  const tabla = tablaDePruebas(baseUrl, serviceKey);
  const filas = generarFilasReclamos({ cantidad, estudiantes, desdeNumero });
  const respuesta = await fetchFn(tabla, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(filas),
    redirect: 'error',
  });

  if (respuesta.status === 409) {
    throw new Error('Hay un ID de reclamo repetido. No se sembró ninguna fila. '
      + 'Usa otro rango con --desde-numero o retira primero una siembra E2 anterior con --limpiar.');
  }
  if (!respuesta.ok) {
    throw new Error(`No se pudo sembrar E2 (${respuesta.status}): ${await respuesta.text()}`);
  }

  return {
    sembrados: filas.length,
    estudiantesDistintos: Math.min(cantidad, estudiantes),
    primerId: filas[0].id,
    ultimoId: filas.at(-1).id,
  };
}

async function ejecutar() {
  const { values: opciones } = parseArgs({
    options: {
      cantidad: { type: 'string', default: '1500' },
      estudiantes: { type: 'string', default: '200' },
      'desde-numero': { type: 'string', default: '1001' },
      limpiar: { type: 'boolean', default: false },
      seco: { type: 'boolean', default: false },
    },
  });

  const cantidad = Number(opciones.cantidad);
  const estudiantes = Number(opciones.estudiantes);
  const desdeNumero = Number(opciones['desde-numero']);
  for (const [opcion, valor] of [['cantidad', cantidad], ['estudiantes', estudiantes], ['desde-numero', desdeNumero]]) {
    if (!Number.isSafeInteger(valor) || valor < 1) {
      throw new Error(`--${opcion} debe ser un entero positivo.`);
    }
  }
  if (!Number.isSafeInteger(desdeNumero + cantidad - 1)) {
    throw new Error('El rango de IDs es demasiado grande.');
  }

  if (opciones.seco) {
    const filas = generarFilasReclamos({ cantidad, estudiantes, desdeNumero });
    console.log(`[Modo seco] Generadas ${filas.length} filas para ${Math.min(cantidad, estudiantes)} estudiantes.`);
    console.log(`Rango de IDs: ${filas[0].id} .. ${filas.at(-1).id}`);
    return;
  }

  const entorno = {
    baseUrl: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  };
  if (opciones.limpiar) {
    await limpiarReclamosPrueba(entorno);
    console.log('Limpieza completada: se retiraron los reclamos sembrados para E2.');
    return;
  }

  const resumen = await sembrarReclamos({ ...entorno, cantidad, estudiantes, desdeNumero });
  console.log(`Sembrados ${resumen.sembrados} reclamos (${resumen.primerId} .. ${resumen.ultimoId}) `
    + `repartidos entre ${resumen.estudiantesDistintos} estudiantes (@${DOMINIO_PRUEBA}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  ejecutar().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
