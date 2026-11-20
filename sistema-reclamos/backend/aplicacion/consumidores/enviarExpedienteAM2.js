/**
 * Consumidor de ReclamoRegistrado: registra el expediente en el servicio M2.
 * El evento no lleva la descripción, así que se lee el reclamo por id.
 *
 * @param {Object} dep
 * @param {import('../../dominio/puertosReclamos.js').RepositorioReclamos} dep.reclamos
 * @param {import('../../dominio/puertosReclamos.js').ClienteM2} dep.m2
 */
export function crearEnviadorDeExpediente({ reclamos, m2 }) {
  return async (evento) => {
    const guardado = await reclamos.obtenerParaExpediente(evento.reclamo.id);
    if (!guardado) throw new Error(`El reclamo ${evento.reclamo.id} no existe; no se registra en M2.`);
    await m2.registrarExpediente({
      id: guardado.id,
      codigoEstudiante: guardado.codigo_estudiante || '',
      email: guardado.email,
      nombre: guardado.nombre || '',
      motivoReclamo: guardado.categoria,
      descripcion: guardado.descripcion,
    });
  };
}
