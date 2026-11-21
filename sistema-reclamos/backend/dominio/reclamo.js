export const MOTIVO_ENTRADA_INVALIDA = 'ENTRADA_INVALIDA';
export const MOTIVO_NO_PERMITIDO = 'NO_PERMITIDO';
export const MOTIVO_CERRADO = 'CERRADO';
export const MOTIVO_NO_DISPONIBLE = 'NO_DISPONIBLE';

/**
 * Códigos estables de error de POST /api/reclamos. El mensaje puede cambiar de redacción;
 * el código no: es lo que lee quien consume la API. SESION_REQUERIDA, SESION_INVALIDA
 * (requireStudentAuth) y CUERPO_INVALIDO (JSON malformado) no salen de aquí.
 */
export const CODIGO = Object.freeze({
  DATOS_INCOMPLETOS: 'DATOS_INCOMPLETOS',
  DESCRIPCION_DEMASIADO_LARGA: 'DESCRIPCION_DEMASIADO_LARGA',
  CODIGO_UNI_INVALIDO: 'CODIGO_UNI_INVALIDO',
  DEMASIADAS_PRUEBAS: 'DEMASIADAS_PRUEBAS',
  PRUEBA_AJENA: 'PRUEBA_AJENA',
  DOCUMENTO_AJENO: 'DOCUMENTO_AJENO',
  VENTANA_CERRADA: 'VENTANA_CERRADA',
  CICLO_CERRADO: 'CICLO_CERRADO',
  SISTEMA_EN_PAUSA: 'SISTEMA_EN_PAUSA',
  SIN_NUMERO_DISPONIBLE: 'SIN_NUMERO_DISPONIBLE',
  ERROR_INTERNO: 'ERROR_INTERNO',
});

/** Qué clase de error es cada rechazo de la política de recepción. */
export const MOTIVO_POR_RECHAZO = Object.freeze({
  [CODIGO.SISTEMA_EN_PAUSA]: MOTIVO_NO_DISPONIBLE,
  [CODIGO.CICLO_CERRADO]: MOTIVO_CERRADO,
  [CODIGO.VENTANA_CERRADA]: MOTIVO_CERRADO,
});

/**
 * Error del dominio: dice qué pasó (`motivo`) y con qué `codigo` estable se informa;
 * el código HTTP lo decide el adaptador.
 */
export class ErrorDeReclamo extends Error {
  constructor(message, motivo = MOTIVO_ENTRADA_INVALIDA, codigo = null) {
    super(message);
    this.motivo = motivo;
    this.codigo = codigo;
  }
}

export const MAX_EVIDENCIAS = 1;
export const MAX_CURSOS = 30;
export const MAX_DESCRIPCION = 5000;

/** Código UNI: 7 u 8 dígitos y una letra. */
export const FORMATO_CODIGO_UNI = /^\d{7,8}[A-Z]$/;

/** Por qué se descarta un curso que mandó el cliente. */
export const MOTIVO_DESCARTE = Object.freeze({
  NO_EXISTE_EN_CATALOGO: 'NO_EXISTE_EN_CATALOGO',
  SECCION_NO_PERTENECE: 'SECCION_NO_PERTENECE',
  EXCEDE_LIMITE: 'EXCEDE_LIMITE',
});

const normalizar = (valor) => String(valor || '').trim().toUpperCase();

/**
 * Separa lo que se guarda de lo que se descarta. Pasados MAX_CURSOS, el resto se
 * descarta por exceso. Lo demás se descarta si no está en el catálogo o si la sección no
 * es de ese curso. El nombre sale del catálogo, nunca del cliente.
 *
 * @param {unknown} lista lo que mandó el cliente
 * @param {Map<string, {nombre: string, secciones: string[]}>} catalogo
 * @param {'retirar'|'matricular'} nombreLista de cuál de las dos listas viene el curso, como se informa en `cursos_descartados`
 * @returns {{cursos: {codigo: string, nombre: string, seccion: string}[],
 *   descartados: {lista: string, codigo: string, seccion: string, motivo: string}[]}}
 */
export function clasificarCursos(lista, catalogo, nombreLista) {
  const cursos = [];
  const descartados = [];
  (Array.isArray(lista) ? lista : []).forEach((c, indice) => {
    const codigo = normalizar(c?.codigo);
    const seccion = normalizar(c?.seccion);
    const descartar = (motivo) => descartados.push({ lista: nombreLista, codigo, seccion, motivo });
    if (indice >= MAX_CURSOS) return descartar(MOTIVO_DESCARTE.EXCEDE_LIMITE);
    const delCatalogo = catalogo.get(codigo);
    if (!delCatalogo) return descartar(MOTIVO_DESCARTE.NO_EXISTE_EN_CATALOGO);
    if (!delCatalogo.secciones.includes(seccion)) return descartar(MOTIVO_DESCARTE.SECCION_NO_PERTENECE);
    cursos.push({ codigo, nombre: delCatalogo.nombre, seccion });
  });
  return { cursos, descartados };
}

/** Los cursos que se guardan, sin el detalle de lo descartado. */
export function sanearCursos(lista, catalogo) {
  return clasificarCursos(lista, catalogo, '').cursos;
}

/**
 * Referencias de archivo que el cliente mandó dentro de `documentos` (ficha, avance, boleta).
 * Ignora valores vacíos y lo que no es texto: no son referencias.
 */
export function referenciasDeDocumentos(documentos) {
  if (!documentos || typeof documentos !== 'object') return [];
  return Object.values(documentos).filter((v) => typeof v === 'string' && v.trim() !== '');
}

/**
 * Las evidencias van dentro de `documentos` para no exigir un cambio de esquema. Solo valen
 * las que pasaron por el campo `evidencias`, que se revalida: una `evidencias` que el cliente
 * ponga dentro de `documentos` se ignora, porque nadie comprobó que fuera suya.
 */
export function armarDocumentos(documentos, evidenciasValidas) {
  const { evidencias: _ignoradas, ...propios } = documentos && typeof documentos === 'object' ? documentos : {};
  return {
    ...propios,
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
