import { Router } from 'express';
import { crearRegistrarReclamoHandler } from './registrarReclamoHandler.js';
import { crearGuardarCursosHandler } from './guardarCursosHandler.js';

/**
 * Rutas HTTP del módulo. Las sesiones las verifica quien le pasa `exigirEstudiante` y
 * `exigirAdmin` (hoy server.js; después, el módulo acceso): reclamos solo declara qué
 * ruta exige cuál.
 *
 * @param {Object} dep
 * @param {Function} dep.exigirEstudiante middleware que deja `req.studentEmail` o responde 401
 * @param {Function} dep.exigirAdmin middleware que deja `req.adminEmail` o responde 401/403
 * @param {Function} dep.registrarReclamo caso de uso que publica ReclamoRegistrado
 * @param {Function} dep.registrarReclamoSinAvisos el mismo caso de uso sin publicar, para el front anterior (#46)
 * @param {Function} dep.guardarCursosResueltos caso de uso de los cursos resueltos
 * @param {Function} dep.logActividad registro de actividad del panel
 */
export function crearRutasDeReclamos({
  exigirEstudiante, exigirAdmin, registrarReclamo, registrarReclamoSinAvisos, guardarCursosResueltos, logActividad,
}) {
  const rutas = Router();

  // Estudiante: crear un reclamo nuevo. El email SIEMPRE sale de la sesión
  // verificada (req.studentEmail), nunca de lo que mande el cliente en el body.
  rutas.post('/api/reclamos', exigirEstudiante,
    crearRegistrarReclamoHandler(registrarReclamo, { sinAvisos: registrarReclamoSinAvisos }));

  // Admin: guardar qué cursos-sección se matriculan y cuáles se retiran de
  // verdad. Es la decisión del Tercio, no lo que pidió el estudiante, y NO se le
  // muestra a él: vive en su propia columna y los dos endpoints que consulta el
  // estudiante piden columnas por nombre, así que esta no sale por ahí.
  rutas.put('/api/admin/reclamos/:id/cursos-resueltos', exigirAdmin,
    crearGuardarCursosHandler(guardarCursosResueltos, logActividad));

  return rutas;
}
