/**
 * Adaptador de producción del puerto PublicadorEventos: un bus dentro del mismo proceso.
 * `publicar` no espera a los consumidores: la petición del estudiante no debe quedar
 * colgada por un proveedor de correo o por M2 lento. Un consumidor que falla no afecta a los demás.
 *
 * @param {{alFallar?: (evento: object, tipoConsumidor: string, err: unknown) => void}} [opciones]
 */
export function crearBusEnProceso({ alFallar = () => {} } = {}) {
  const suscriptores = new Map();
  const pendientes = new Set();

  return {
    /** @param {string} tipo @param {(evento: object) => Promise<void>} manejador @param {string} [nombre] */
    suscribir(tipo, manejador, nombre = manejador.name || 'consumidor') {
      const lista = suscriptores.get(tipo) ?? [];
      lista.push({ manejador, nombre });
      suscriptores.set(tipo, lista);
    },

    async publicar(evento) {
      for (const { manejador, nombre } of suscriptores.get(evento.tipo) ?? []) {
        const trabajo = Promise.resolve()
          .then(() => manejador(evento))
          .catch((err) => alFallar(evento, nombre, err))
          .finally(() => pendientes.delete(trabajo));
        pendientes.add(trabajo);
      }
    },

    /** Resuelve cuando terminaron los consumidores en curso. Útil en pruebas y al apagar el servidor. */
    async vaciar() {
      while (pendientes.size) await Promise.all([...pendientes]);
    },
  };
}
