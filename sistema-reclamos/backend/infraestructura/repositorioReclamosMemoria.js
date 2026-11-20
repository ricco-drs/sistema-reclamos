/**
 * Adaptador en memoria del puerto RepositorioReclamos, para pruebas sin base de datos.
 * @param {{sinSecuencia?: boolean, colisiones?: number, falloInsercion?: string, reloj?: () => Date}} [opciones]
 *   sinSecuencia: la secuencia no responde. colisiones: cuántos inserts seguidos chocan.
 *   falloInsercion: texto de un error real de la base en el primer insert. reloj: fecha de creación de cada fila.
 * @returns {import('../dominio/puertosReclamos.js').RepositorioReclamos & {filas: object[]}}
 */
export function crearRepositorioReclamosMemoria({ sinSecuencia = false, colisiones = 0, falloInsercion = null, reloj = () => new Date() } = {}) {
  const filas = [];
  let secuencia = 0;
  let porChocar = colisiones;

  return {
    filas,
    async buscarDuplicado(email, descripcion, desdeIso) {
      const f = filas.find((x) => x.email === email && String(x.descripcion).trim() === descripcion
        && (x.creadoEn ?? desdeIso) >= desdeIso);
      return f ? f.id : null;
    },
    async siguienteNumero() {
      if (sinSecuencia) return null;
      return ++secuencia;
    },
    async ultimoIdDelAnio(anio) {
      const ids = filas.map((f) => f.id).filter((id) => id.startsWith(`REC-${anio}-`)).sort();
      return ids.at(-1) ?? null;
    },
    async insertar(fila) {
      if (falloInsercion) return { ok: false, colision: false, detalle: falloInsercion };
      if (porChocar > 0) { porChocar--; return { ok: false, colision: true, detalle: '23505 clave duplicada' }; }
      if (filas.some((f) => f.id === fila.id)) return { ok: false, colision: true, detalle: '23505 clave duplicada' };
      filas.push({ ...fila, creadoEn: reloj().toISOString() });
      return { ok: true };
    },
    async obtenerParaExpediente(id) {
      return filas.find((f) => f.id === id) ?? null;
    },
  };
}
