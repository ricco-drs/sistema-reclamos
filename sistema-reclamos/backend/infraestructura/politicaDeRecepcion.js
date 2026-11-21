import { CODIGO } from '../dominio/reclamo.js';

/**
 * Adaptador del puerto PoliticaDeRecepcion sobre las comprobaciones que ya existen en server.js.
 * Conserva el orden y los mensajes de la ruta actual, y le da a cada rechazo su código estable:
 * pausa de la plataforma, ciclo terminado y ventana cerrada.
 *
 * @param {{tefiDurmiendoActivo: () => Promise<boolean>, despedidaActivaPara: (email: string) => Promise<boolean>,
 *   puedeEnviarReclamo: (email: string) => Promise<boolean>}} dep
 * @returns {import('../dominio/puertosReclamos.js').PoliticaDeRecepcion}
 */
export function crearPoliticaDeRecepcion({ tefiDurmiendoActivo, despedidaActivaPara, puedeEnviarReclamo }) {
  return {
    async motivoDeRechazo(email) {
      if (await tefiDurmiendoActivo()) {
        return {
          codigo: CODIGO.SISTEMA_EN_PAUSA,
          mensaje: 'Tefi está durmiendo y no se pueden enviar reclamos por ahora. Vuelve a intentarlo cuando despierte.',
        };
      }
      if (await despedidaActivaPara(email)) {
        return { codigo: CODIGO.CICLO_CERRADO, mensaje: 'El proceso de matrícula ha terminado. Nos vemos el siguiente ciclo.' };
      }
      if (!(await puedeEnviarReclamo(email))) {
        return {
          codigo: CODIGO.VENTANA_CERRADA,
          mensaje: 'La ventana de reclamos está cerrada en este momento. Vuelve a intentarlo cuando El Tercio la habilite.',
        };
      }
      return null;
    },
  };
}
