// Entrada pública del módulo notificaciones (docs/particiones.md): los consumidores de
// ReclamoRegistrado. Lo que no se exporta aquí es interno. Este módulo no importa a
// reclamos: el nombre del evento y la fuente de los expedientes se los pasa server.js.
import { componerConfirmacion } from './presentacion/componerConfirmacion.js';
import { crearNotificadorDeReclamo } from './aplicacion/notificarReclamoRegistrado.js';
import { crearEnviadorDeExpediente } from './aplicacion/enviarExpedienteAM2.js';
import { crearClienteM2Http, crearClienteM2Memoria } from './infraestructura/clienteM2.js';

// componerConfirmacion también la usa /api/reclamos/confirmar mientras dure la transición (#46).
export { componerConfirmacion, crearNotificadorDeReclamo, crearEnviadorDeExpediente, crearClienteM2Http, crearClienteM2Memoria };

/**
 * Los dos consumidores de ReclamoRegistrado, listos para suscribirlos al bus.
 *
 * @param {Object} dep
 * @param {(correo: {to: string, subject: string, html: string}) => Promise<void>} dep.enviarCorreo
 * @param {import('./dominio/puertos.js').FuenteDeExpedientes} dep.fuenteDeExpedientes
 * @param {import('./dominio/puertos.js').ClienteM2} dep.m2
 */
export function crearConsumidoresDeReclamoRegistrado({ enviarCorreo, fuenteDeExpedientes, m2 }) {
  return {
    correo: crearNotificadorDeReclamo({ componerCorreo: componerConfirmacion, enviarCorreo }),
    m2: crearEnviadorDeExpediente({ fuente: fuenteDeExpedientes, m2 }),
  };
}
