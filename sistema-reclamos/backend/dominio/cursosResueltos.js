export class ErrorDeCursos extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
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
  const historial = Array.isArray(previo?.historial) ? previo.historial.slice(-49) : [];
  historial.push({ admin, fecha, matricular, desmatricular });
  return { matricular, desmatricular, actualizadoPor: admin, actualizadoEn: fecha, historial };
}
