/**
 * Puertos de notificaciones. Solo describen contratos: los implementan los adaptadores de
 * `infraestructura/` o lo que server.js le pase al módulo. Notificaciones no importa a
 * reclamos; lo que necesita de él le llega por estos puertos.
 */

/**
 * Lo que los consumidores leen de ReclamoRegistrado. El evento lo define reclamos (versión 1,
 * docs/api/eventos.md) y trae más campos, pero aquí solo se usan estos cuatro.
 * backend/tests/flujoReclamoRegistrado.test.js comprueba que el evento de reclamos los trae.
 * @typedef {{reclamo: {id: string, email: string, nombre: string|null, categoria: string}}} ReclamoRegistradoLeido
 */

/**
 * Datos del reclamo que no viajan en el evento, como la descripción. Lo implementa el
 * repositorio de reclamos (`obtenerParaExpediente`) y server.js se lo pasa al consumidor de M2.
 * @typedef {Object} FuenteDeExpedientes
 * @property {(id: string) => Promise<{id: string, codigo_estudiante: string|null, email: string,
 *   nombre: string|null, categoria: string, descripcion: string} | null>} obtenerParaExpediente
 */

/**
 * @typedef {Object} ClienteM2
 * @property {(expediente: {id: string, codigoEstudiante: string, email: string, nombre: string,
 *   motivoReclamo: string, descripcion: string}) => Promise<void>} registrarExpediente
 */
