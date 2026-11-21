// express.json() rechaza el cuerpo antes de llegar a cualquier ruta: si no es
// JSON válido marca el error con `entity.parse.failed`, y si pasa del límite,
// con `entity.too.large`. Sin esta traducción caían en el manejador final como
// un 500 «Error interno del servidor», aunque el problema era de la petición.
//
// El contrato acordado (docs/api/openapi.yaml) los junta en un solo 400 con
// codigo CUERPO_INVALIDO: para el cliente es el mismo caso, no puede leer nada
// de lo que mandó.

export const MENSAJE_CUERPO_INVALIDO = 'El cuerpo de la petición no es JSON válido o pasa de 1 MB.';

const TIPOS_DE_CUERPO_INVALIDO = new Set(['entity.parse.failed', 'entity.too.large']);

/** La respuesta para un cuerpo que express.json() no pudo leer, o null si el error es otro. */
export function respuestaDeCuerpoInvalido(err) {
  if (!TIPOS_DE_CUERPO_INVALIDO.has(err?.type)) return null;
  return { status: 400, body: { codigo: 'CUERPO_INVALIDO', error: MENSAJE_CUERPO_INVALIDO } };
}
