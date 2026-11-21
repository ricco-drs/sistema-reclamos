/**
 * Consumidor de ReclamoRegistrado: registra el expediente en el servicio M2.
 * El evento solo le da el id; la descripción y los demás datos los lee de la fuente que
 * le pasa server.js (el repositorio de reclamos), sin importar el módulo reclamos.
 *
 * @param {Object} dep
 * @param {import('../dominio/puertos.js').FuenteDeExpedientes} dep.fuente
 * @param {import('../dominio/puertos.js').ClienteM2} dep.m2
 */
export function crearEnviadorDeExpediente({ fuente, m2 }) {
  /** @param {import('../dominio/puertos.js').ReclamoRegistradoLeido} evento */
  return async (evento) => {
    const guardado = await fuente.obtenerParaExpediente(evento.reclamo.id);
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
