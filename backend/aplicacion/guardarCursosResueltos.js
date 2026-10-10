import { cursosValidos, prepararCursosResueltos, ErrorDeCursos } from '../dominio/cursosResueltos.js';

// Puerto requerido: obtener(id) y guardar(id, valor). El caso de uso no importa Supabase.
export function crearGuardarCursosResueltos(repositorio, reloj = () => new Date().toISOString()) {
  return async ({ id, admin, matricular, desmatricular }) => {
    const altas = cursosValidos(matricular, 'matricular');
    const bajas = cursosValidos(desmatricular, 'desmatricular');
    const actual = await repositorio.obtener(id);
    if (!actual) throw new ErrorDeCursos('Ese reclamo no existe.', 404);
    const valor = prepararCursosResueltos(actual.cursos_resueltos, altas, bajas, admin, reloj());
    if (!(await repositorio.guardar(id, valor))) {
      throw new ErrorDeCursos('Ese reclamo no existe.', 404);
    }
    return valor;
  };
}
