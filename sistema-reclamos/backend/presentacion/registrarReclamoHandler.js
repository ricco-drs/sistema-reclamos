import {
  ErrorDeReclamo, MOTIVO_ENTRADA_INVALIDA, MOTIVO_NO_PERMITIDO, MOTIVO_CERRADO, MOTIVO_NO_DISPONIBLE, CODIGO,
} from '../dominio/reclamo.js';

// Traducción a HTTP de los errores del dominio. El 401 no pasa por aquí:
// lo responde requireStudentAuth antes de llegar al manejador.
const STATUS_POR_MOTIVO = {
  [MOTIVO_ENTRADA_INVALIDA]: 400,
  [MOTIVO_NO_PERMITIDO]: 403,
  [MOTIVO_CERRADO]: 409,
  [MOTIVO_NO_DISPONIBLE]: 503,
};

/** Segundos que se le piden esperar a quien no obtuvo número: la numeración compite con otros reclamos y se libera enseguida. */
export const REINTENTAR_DESPUES_DE_S = 5;

/** Valor del campo `avisos` con el que el front le pide a la API que envíe el correo y el expediente. */
export const AVISOS_POR_API = 'api';

export function statusDeErrorDeReclamo(err) {
  return err instanceof ErrorDeReclamo ? (STATUS_POR_MOTIVO[err.motivo] ?? 500) : 500;
}

/** Dónde se lee el reclamo recién registrado: la ruta del estudiante para ver el suyo. */
export const ubicacionDeReclamo = (id) => `/api/reclamos/mine/${encodeURIComponent(id)}`;

/**
 * Adaptador Express de POST /api/reclamos. Espera `req.studentEmail` ya autenticado.
 *
 * Respuestas: 201 con `Location`, `estado`, `creado_en` y `cursos_descartados` al crear; 200 con `Location`, `creado_en` y
 * `duplicado: true` si es el reenvío de un reclamo de los últimos 10 minutos (no guarda nada,
 * así que no trae `cursos_descartados`). Los errores llevan `error` (mensaje) y `codigo` (estable);
 * la pausa por falta de número agrega `Retry-After`.
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
      const { id, duplicado, estado, creadoEn, cursosDescartados } = await registrar({ email: req.studentEmail, entrada: req.body });
      res.set('Location', ubicacionDeReclamo(id));
      return res.status(duplicado ? 200 : 201).json({
        success: true,
        id,
        ...(duplicado ? { duplicado: true } : { estado }),
        creado_en: creadoEn,
        ...(duplicado ? {} : { cursos_descartados: cursosDescartados ?? [] }),
        ...(pideAvisos ? { avisos: AVISOS_POR_API } : {}),
      });
    } catch (err) {
      const codigo = err instanceof ErrorDeReclamo && err.codigo ? err.codigo : CODIGO.ERROR_INTERNO;
      if (codigo === CODIGO.SIN_NUMERO_DISPONIBLE) res.set('Retry-After', String(REINTENTAR_DESPUES_DE_S));
      return res.status(statusDeErrorDeReclamo(err)).json({ error: err.message, codigo });
    }
  };
}
