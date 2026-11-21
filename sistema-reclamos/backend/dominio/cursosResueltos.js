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

// Congela el valor y todo lo que contiene, no solo el primer nivel.
function congelar(valor) {
  if (valor && typeof valor === 'object') {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

/**
 * Decisión del Tercio sobre qué cursos-sección se matriculan y cuáles se retiran.
 * Es inmutable: registrar una decisión devuelve otra instancia. Copia lo que recibe y congela
 * las listas y los objetos anidados, así que cambiar la entrada original o lo que devuelve
 * `aPlano()` no altera una instancia ya creada.
 */
export class CursosResueltos {
  #datos;

  constructor({ matricular = [], desmatricular = [], actualizadoPor = null, actualizadoEn = null, historial = [] } = {}) {
    this.#datos = congelar(structuredClone({ matricular, desmatricular, actualizadoPor, actualizadoEn, historial }));
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

  /** Forma que se guarda en la columna `cursos_resueltos`. Es una copia: quien la reciba puede modificarla. */
  aPlano() {
    return structuredClone(this.#datos);
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
