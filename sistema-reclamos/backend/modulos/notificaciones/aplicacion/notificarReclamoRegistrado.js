/**
 * Consumidor de ReclamoRegistrado: manda la confirmación por correo.
 * Solo usa id, email, nombre y categoría; la plantilla y el envío se inyectan.
 *
 * @param {Object} dep
 * @param {(datos: {id: string, nombre: string|null, categoria: string}) => {subject: string, html: string}} dep.componerCorreo
 * @param {(correo: {to: string, subject: string, html: string}) => Promise<void>} dep.enviarCorreo
 */
export function crearNotificadorDeReclamo({ componerCorreo, enviarCorreo }) {
  return async (evento) => {
    const { id, email, nombre, categoria } = evento.reclamo;
    const { subject, html } = componerCorreo({ id, email, nombre, categoria });
    await enviarCorreo({ to: email, subject, html });
  };
}
