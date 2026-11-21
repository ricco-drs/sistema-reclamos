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

/** Valor del campo `avisos` con el que el front le pide a la API que envíe el correo y el expediente. */
export const AVISOS_POR_API = 'api';

export function statusDeErrorDeReclamo(err) {
  return err instanceof ErrorDeReclamo ? (STATUS_POR_MOTIVO[err.motivo] ?? 500) : 500;
}

/**
 * Adaptador Express de POST /api/reclamos. Espera `req.studentEmail` ya autenticado.
 *
 * Transición entre el front anterior y el nuevo (#46). El anterior envía él mismo el
 * correo de confirmación y el expediente a M2; el nuevo se los deja a la API. Como la API
 * y el front se despliegan por separado, y un estudiante puede seguir con la página
 * anterior abierta, conviven los dos, y cada reclamo tiene que seguir un solo camino:
 * - El front nuevo manda `avisos: "api"`. Se usa `registrarReclamo`, que publica
 *   ReclamoRegistrado, y la respuesta lo confirma con `avisos: "api"`. Si el front no ve
 *   esa confirmación, está hablando con una API anterior y envía él mismo.
 * - Sin ese campo (front anterior) se usa `sinAvisos`, que registra sin publicar.
 * Cuando ya no quede el front anterior, el manejador se crea sin `sinAvisos` y todo publica.
 *
 * @param {Function} registrarReclamo caso de uso que publica ReclamoRegistrado
 * @param {{sinAvisos?: Function}} [transicion] caso de uso que registra sin publicar, para el front anterior
 */
export function crearRegistrarReclamoHandler(registrarReclamo, { sinAvisos } = {}) {
  return async (req, res) => {
    const pideAvisos = req.body?.avisos === AVISOS_POR_API;
    const registrar = pideAvisos || !sinAvisos ? registrarReclamo : sinAvisos;
    try {
      const { id, duplicado } = await registrar({ email: req.studentEmail, entrada: req.body });
      return res.json({
        success: true,
        id,
        ...(duplicado ? { duplicado: true } : {}),
        ...(pideAvisos ? { avisos: AVISOS_POR_API } : {}),
      });
    } catch (err) {
      return res.status(statusDeErrorDeReclamo(err)).json({ error: err.message });
    }
  };
}
