/**
 * Adaptador en memoria del mismo puerto. Sirve para pruebas rápidas sin base de datos.
 * @returns {import('../dominio/repositorioCursosResueltos.js').RepositorioCursosResueltos}
 */
export function crearRepositorioCursosMemoria(inicial = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    async obtener(id) {
      return datos.has(id) ? { cursos_resueltos: datos.get(id) } : null;
    },
    async guardar(id, valor) {
      if (!datos.has(id)) return false;
      datos.set(id, valor);
      return true;
    },
  };
}
