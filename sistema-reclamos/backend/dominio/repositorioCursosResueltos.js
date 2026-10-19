/**
 * Puerto de persistencia de cursos resueltos.
 * @typedef {Object} RepositorioCursosResueltos
 * @property {(id: string) => Promise<{cursos_resueltos: object} | null>} obtener
 * @property {(id: string, valor: object) => Promise<boolean>} guardar
 */
