import {
  ErrorDeReclamo, MOTIVO_ENTRADA_INVALIDA, MOTIVO_NO_PERMITIDO, MOTIVO_NO_DISPONIBLE,
} from '../dominio/reclamo.js';

// Traducción a HTTP de los errores del dominio. El 401 no pasa por aquí:
// lo responde requireStudentAuth antes de llegar al manejador.
const STATUS_POR_MOTIVO = {
  [MOTIVO_ENTRADA_INVALIDA]: 400,
  [MOTIVO_NO_PERMITIDO]: 403,
  [MOTIVO_NO_DISPONIBLE]: 503,
};

export function statusDeErrorDeReclamo(err) {
  return err instanceof ErrorDeReclamo ? (STATUS_POR_MOTIVO[err.motivo] ?? 500) : 500;
}

/** Adaptador Express de POST /api/reclamos. Espera `req.studentEmail` ya autenticado. */
export function crearRegistrarReclamoHandler(registrarReclamo) {
  return async (req, res) => {
    try {
      const { id, duplicado } = await registrarReclamo({ email: req.studentEmail, entrada: req.body });
      return res.json({ success: true, id, ...(duplicado ? { duplicado: true } : {}) });
    } catch (err) {
      return res.status(statusDeErrorDeReclamo(err)).json({ error: err.message });
    }
  };
}
