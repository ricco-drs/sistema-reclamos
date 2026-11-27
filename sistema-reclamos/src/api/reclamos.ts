// Envoltorio a mano sobre el cliente generado (./generado), para lo que el generador no modela.
//
// `POST /api/reclamos` tiene dos respuestas exitosas con cuerpos distintos: 201 (`ReclamoCreado`) y
// 200 (`ReclamoExistente`, el reenvío). openapi-generator escribe un solo tipo de retorno para
// `registrarReclamo()`: el de la última respuesta 2xx del contrato, que es el del reenvío. Con él, un
// 201 se leería como `ReclamoExistente` y se perderían `estado` y `cursosDescartados`. Esta función
// separa los dos casos por el código HTTP. Y convierte los errores del contrato en `ErrorDeApi`,
// con el `codigo` estable que dice `ErrorDeReclamo`.
//
// Lo que se pide de la API está en docs/api/openapi.yaml; no se escribe a mano aquí.

import {
  ReclamoCreadoFromJSON,
  ReclamoExistenteFromJSON,
  ErrorDeReclamoFromJSON,
  ResponseError,
} from './generado';
import type {
  ErrorDeReclamoCodigoEnum,
  NuevoReclamo,
  ReclamoCreado,
  ReclamoExistente,
  ReclamosDelEstudianteApiInterface,
} from './generado';

export type ResultadoDeRegistro =
  | { tipo: 'creado'; reclamo: ReclamoCreado; ubicacion: string | null }
  | { tipo: 'reenvio'; reclamo: ReclamoExistente; ubicacion: string | null };

/** Un error del contrato: el estado HTTP y el `codigo` que no cambia aunque cambie el mensaje. */
export class ErrorDeApi extends Error {
  constructor(
    mensaje: string,
    readonly estado: number,
    readonly codigo: ErrorDeReclamoCodigoEnum | null,
    /** Segundos que pide esperar la API (cabecera `Retry-After`), si los pide. */
    readonly reintentarDespuesDe: number | null,
  ) {
    super(mensaje);
    this.name = 'ErrorDeApi';
  }
}

async function comoErrorDeApi(error: unknown): Promise<unknown> {
  if (!(error instanceof ResponseError)) return error;
  const { response } = error;
  const espera = Number(response.headers.get('Retry-After'));
  let cuerpo: ReturnType<typeof ErrorDeReclamoFromJSON> | null = null;
  try {
    cuerpo = ErrorDeReclamoFromJSON(await response.clone().json());
  } catch {
    // Un cuerpo que no es del contrato (por ejemplo el de un proxy): queda sin código.
  }
  return new ErrorDeApi(
    cuerpo?.error ?? `La API respondió ${response.status}.`,
    response.status,
    cuerpo?.codigo ?? null,
    Number.isFinite(espera) && espera > 0 ? espera : null,
  );
}

/**
 * Registra un reclamo y dice si se creó (201) o era un reenvío de los últimos 10 minutos (200).
 * Lanza `ErrorDeApi` con el `codigo` del contrato si la API rechaza la petición.
 */
export async function registrarReclamo(
  api: ReclamosDelEstudianteApiInterface,
  nuevoReclamo: NuevoReclamo,
): Promise<ResultadoDeRegistro> {
  try {
    const { raw } = await api.registrarReclamoRaw({ nuevoReclamo });
    const ubicacion = raw.headers.get('Location');
    const json = await raw.json();
    return raw.status === 201
      ? { tipo: 'creado', reclamo: ReclamoCreadoFromJSON(json), ubicacion }
      : { tipo: 'reenvio', reclamo: ReclamoExistenteFromJSON(json), ubicacion };
  } catch (error) {
    throw await comoErrorDeApi(error);
  }
}
