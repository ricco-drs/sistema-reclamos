/**
 * Adaptador HTTP del puerto ClienteM2. Mismo contrato que usa hoy la aplicación de
 * estudiantes: POST JSON sin autenticación. A diferencia de ella, falla con error
 * (para que el bus lo registre) y corta a los 10 s, porque el servicio puede estar dormido.
 *
 * @param {{url: string, fetchFn?: typeof fetch, timeoutMs?: number}} opciones
 * @returns {import('../dominio/puertosReclamos.js').ClienteM2}
 */
export function crearClienteM2Http({ url, fetchFn = fetch, timeoutMs = 10_000 }) {
  return {
    async registrarExpediente(expediente) {
      const r = await fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expediente),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) throw new Error(`M2 respondió ${r.status} al registrar ${expediente.id}`);
    },
  };
}

/** Adaptador falso: guarda los expedientes recibidos. Para pruebas y para Compose sin M2. */
export function crearClienteM2Memoria() {
  const expedientes = [];
  return { expedientes, async registrarExpediente(e) { expedientes.push(e); } };
}
