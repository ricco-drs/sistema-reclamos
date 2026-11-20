export const MOTIVO_ENTRADA_INVALIDA = 'ENTRADA_INVALIDA';
export const MOTIVO_NO_EXISTE = 'NO_EXISTE';

/** Error del dominio. Dice qué pasó (`motivo`); cómo se comunica por HTTP lo decide el adaptador. */
export class ErrorDeCursos extends Error {
  constructor(message, motivo = MOTIVO_ENTRADA_INVALIDA) {
    super(message);
    this.motivo = motivo;
  }
}

const MAX_HISTORIAL = 50;

/**
 * Decisión del Tercio sobre qué cursos-sección se matriculan y cuáles se retiran.
 * Es inmutable: registrar una decisión devuelve otra instancia.
 */
export class CursosResueltos {
  #datos;

  constructor({ matricular = [], desmatricular = [], actualizadoPor = null, actualizadoEn = null, historial = [] } = {}) {
    this.#datos = Object.freeze({
      matricular, desmatricular, actualizadoPor, actualizadoEn, historial: Object.freeze([...historial]),
    });
    Object.freeze(this);
  }

  /** Reconstruye la entidad desde lo que guarda la persistencia (puede ser null o `{}`). */
  static desde(persistido) {
    return new CursosResueltos({ ...persistido, historial: Array.isArray(persistido?.historial) ? persistido.historial : [] });
  }

  get historial() { return this.#datos.historial; }

  /** Registra una decisión nueva y conserva solo las últimas 50 del historial. */
  registrar(matricular, desmatricular, admin, fecha) {
    const historial = [...this.#datos.historial.slice(-(MAX_HISTORIAL - 1)), { admin, fecha, matricular, desmatricular }];
    return new CursosResueltos({ matricular, desmatricular, actualizadoPor: admin, actualizadoEn: fecha, historial });
  }

  /** Forma que se guarda en la columna `cursos_resueltos`. */
  aPlano() {
    const { matricular, desmatricular, actualizadoPor, actualizadoEn, historial } = this.#datos;
    return { matricular, desmatricular, actualizadoPor, actualizadoEn, historial: [...historial] };
  }
}

export function cursosValidos(lista, campo) {
  if (lista === undefined) return [];
  if (!Array.isArray(lista)) throw new ErrorDeCursos(`"${campo}" debe ser una lista.`);
  if (lista.length > 40) throw new ErrorDeCursos(`Demasiados cursos en "${campo}".`);
  return lista.map((c) => {
    const codigo = String(c?.codigo || '').trim().toUpperCase();
    const seccion = String(c?.seccion || '').trim().toUpperCase();
    if (!codigo || !seccion) throw new ErrorDeCursos(`Cada curso de "${campo}" necesita código y sección.`);
    return { codigo, seccion, nombre: String(c?.nombre || '').trim().slice(0, 120) };
  });
}

export function prepararCursosResueltos(previo, matricular, desmatricular, admin, fecha) {
  return CursosResueltos.desde(previo).registrar(matricular, desmatricular, admin, fecha).aPlano();
}
