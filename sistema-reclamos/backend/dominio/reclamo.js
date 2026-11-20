export const MOTIVO_ENTRADA_INVALIDA = 'ENTRADA_INVALIDA';
export const MOTIVO_NO_PERMITIDO = 'NO_PERMITIDO';
export const MOTIVO_NO_DISPONIBLE = 'NO_DISPONIBLE';

/** Error del dominio: dice qué pasó (`motivo`); el código HTTP lo decide el adaptador. */
export class ErrorDeReclamo extends Error {
  constructor(message, motivo = MOTIVO_ENTRADA_INVALIDA) {
    super(message);
    this.motivo = motivo;
  }
}

export const MAX_EVIDENCIAS = 1;
export const MAX_CURSOS = 30;

/**
 * Corta la lista en MAX_CURSOS y descarta sin avisar lo que no está en el catálogo.
 * El nombre sale del catálogo, nunca del cliente.
 * @param {Map<string, {nombre: string, secciones: string[]}>} catalogo
 */
export function sanearCursos(lista, catalogo) {
  return (Array.isArray(lista) ? lista : [])
    .slice(0, MAX_CURSOS)
    .map((c) => {
      const codigo = String(c?.codigo || '').trim().toUpperCase();
      const seccion = String(c?.seccion || '').trim().toUpperCase();
      const delCatalogo = catalogo.get(codigo);
      if (!delCatalogo || !delCatalogo.secciones.includes(seccion)) return null;
      return { codigo, nombre: delCatalogo.nombre, seccion };
    })
    .filter(Boolean);
}

/** Las evidencias van dentro de `documentos` para no exigir un cambio de esquema. */
export function armarDocumentos(documentos, evidenciasValidas) {
  return {
    ...(documentos && typeof documentos === 'object' ? documentos : {}),
    ...(evidenciasValidas.length ? { evidencias: evidenciasValidas.map((e) => ({
      ref: e.ref,
      nombre: String(e.nombre || 'archivo').slice(0, 120),
      tipo: String(e.tipo || '').slice(0, 60),
      bytes: Number(e.bytes) || 0,
    })) } : {}),
  };
}

export function idDeReclamo(anio, numero) {
  return `REC-${anio}-${String(numero).padStart(4, '0')}`;
}

/** Número que sigue al último id `REC-AAAA-NNNN` del año, o 1 si no hay ninguno legible. */
export function numeroSiguienteDe(ultimoId) {
  const ultimo = parseInt(String(ultimoId ?? '').split('-')[2], 10);
  return Number.isNaN(ultimo) ? 1 : ultimo + 1;
}
