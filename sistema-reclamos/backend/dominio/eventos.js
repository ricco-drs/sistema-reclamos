export const RECLAMO_REGISTRADO = 'ReclamoRegistrado';

/**
 * Hecho: un reclamo quedó guardado. No lleva la descripción (texto libre del
 * estudiante); quien la necesite la lee por id.
 * @typedef {Object} EventoReclamoRegistrado
 * @property {string} eventoId   `<id del reclamo>:ReclamoRegistrado`; sirve para descartar repetidos.
 * @property {'ReclamoRegistrado'} tipo
 * @property {1} version
 * @property {string} ocurridoEn ISO 8601
 * @property {{id: string, email: string, nombre: string|null, codigoEstudiante: string|null,
 *   categoria: string, cursosRetirar: {codigo: string, seccion: string}[],
 *   cursosMatricular: {codigo: string, seccion: string}[], tieneEvidencia: boolean}} reclamo
 */

const sinNombre = ({ codigo, seccion }) => ({ codigo, seccion });

/** @returns {EventoReclamoRegistrado} */
export function crearReclamoRegistrado(reclamo, ocurridoEn) {
  return Object.freeze({
    eventoId: `${reclamo.id}:${RECLAMO_REGISTRADO}`,
    tipo: RECLAMO_REGISTRADO,
    version: 1,
    ocurridoEn,
    reclamo: Object.freeze({
      id: reclamo.id,
      email: reclamo.email,
      nombre: reclamo.nombre ?? null,
      codigoEstudiante: reclamo.codigoEstudiante ?? null,
      categoria: reclamo.categoria,
      cursosRetirar: reclamo.cursosRetirar.map(sinNombre),
      cursosMatricular: reclamo.cursosMatricular.map(sinNombre),
      tieneEvidencia: Boolean(reclamo.tieneEvidencia),
    }),
  });
}
