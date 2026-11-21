/**
 * Adaptador en memoria del puerto PublicadorEventos: guarda lo publicado para inspeccionarlo en pruebas.
 * @returns {import('../dominio/puertosReclamos.js').PublicadorEventos & {publicados: object[]}}
 */
export function crearPublicadorMemoria() {
  const publicados = [];
  return {
    publicados,
    async publicar(evento) { publicados.push(evento); },
  };
}
