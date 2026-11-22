import { sbRest } from './postgrest.js';

// Historial de actividad: registra acciones significativas (login, subir/borrar
// documentos, crear reclamo, cambiar estado, indexar RAG, mantenimiento). No
// registra lecturas ni eventos internos automáticos, para no volverlo ruido.
// Nunca debe romper el flujo principal si falla, por eso no se espera su resultado.
export function logActividad({ actorEmail, actorType, accion, detalle }) {
  sbRest('/activity_log', {
    method: 'POST',
    headers: { 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      actor_email: actorEmail ? actorEmail.toLowerCase() : null,
      actor_type: actorType,
      accion,
      detalle: detalle || null,
    }),
  }).catch(err => console.error('No se pudo registrar actividad:', err.message));
}
