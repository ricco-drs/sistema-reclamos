import {
  URL_BREVO_DEFAULT,
  URL_RESEND_DEFAULT,
  URL_MAILJET_DEFAULT,
} from '../backend/infraestructura/enviadorCorreo.js';

/**
 * Proveedor simulado local de las tres APIs de correo (Brevo, Resend y Mailjet) para las
 * pruebas y el experimento de resiliencia (Lab11 / E5) sin tocar la red ni gastar cuota real.
 *
 * Modos soportados por proveedor:
 * - `'ok'`: responde 200 de inmediato y registra el envío.
 * - `'401'`: responde 401 (clave inválida).
 * - `'429'`: responde 429 (cuota diaria agotada).
 * - `'500'`: responde 500 (error interno del proveedor).
 * - `'lento'`: demora `demoraLentoMs` y luego responde 200; si la petición trae un
 *   `AbortSignal` que vence antes, aborta con `TimeoutError`.
 * - `'colgado'`: deja la conexión abierta sin resolver nunca, salvo que la petición
 *   traiga un `AbortSignal` que la corte con `TimeoutError`.
 *
 * @param {Object} [opciones]
 * @param {'ok'|'401'|'429'|'500'|'lento'|'colgado'} [opciones.Brevo]
 * @param {'ok'|'401'|'429'|'500'|'lento'|'colgado'} [opciones.Resend]
 * @param {'ok'|'401'|'429'|'500'|'lento'|'colgado'} [opciones.Mailjet]
 * @param {number} [opciones.demoraLentoMs]
 */
export function crearProveedorCorreoSimulado({
  Brevo = 'ok',
  Resend = 'ok',
  Mailjet = 'ok',
  demoraLentoMs = 50,
} = {}) {
  const modos = { Brevo, Resend, Mailjet };
  const conteos = { Brevo: 0, Resend: 0, Mailjet: 0 };
  const abortadosPorTimeout = { Brevo: 0, Resend: 0, Mailjet: 0 };
  const enviados = [];
  const timersActivos = new Set();

  function identificarProveedor(url) {
    const u = String(url);
    if (u.includes('brevo')) return 'Brevo';
    if (u.includes('resend')) return 'Resend';
    if (u.includes('mailjet')) return 'Mailjet';
    throw new Error(`URL de proveedor desconocida: ${u}`);
  }

  function extraerDestinatarioYAsunto(nombre, bodyStr) {
    const body = JSON.parse(bodyStr || '{}');
    if (nombre === 'Brevo') return { to: body.to?.[0]?.email, subject: body.subject };
    if (nombre === 'Resend') return { to: body.to?.[0], subject: body.subject };
    return { to: body.Messages?.[0]?.To?.[0]?.Email, subject: body.Messages?.[0]?.Subject };
  }

  function esperarConSignal(ms, signal, nombre, nuncaResuelve = false) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        abortadosPorTimeout[nombre]++;
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        reject(err);
        return;
      }
      // AbortSignal.timeout usa un timer unref() en Node.js: mantenemos un timer activo
      // para que el event loop no salga con "unsettled top-level await" antes del abort.
      const timer = setTimeout(() => {
        timersActivos.delete(timer);
        if (nuncaResuelve) return;
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      }, nuncaResuelve ? 60_000 : ms);
      timersActivos.add(timer);
      function onAbort() {
        clearTimeout(timer);
        timersActivos.delete(timer);
        abortadosPorTimeout[nombre]++;
        const err = new Error('The operation was aborted due to timeout');
        err.name = 'TimeoutError';
        reject(err);
      }
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function fetchFn(url, opts = {}) {
    const nombre = identificarProveedor(url);
    conteos[nombre]++;
    const modo = modos[nombre];

    if (modo === 'lento') {
      await esperarConSignal(demoraLentoMs, opts.signal, nombre, false);
    } else if (modo === 'colgado') {
      await esperarConSignal(0, opts.signal, nombre, true);
    }

    if (modo === '401') {
      return {
        ok: false,
        status: 401,
        json: async () => (nombre === 'Mailjet'
          ? { ErrorMessage: 'Mailjet 401 unauthorized' }
          : { message: `${nombre} 401 clave inválida` }),
      };
    }
    if (modo === '429') {
      return {
        ok: false,
        status: 429,
        json: async () => (nombre === 'Mailjet'
          ? { ErrorMessage: 'Mailjet 429 cuota agotada' }
          : { message: `${nombre} 429 cuota diaria agotada` }),
      };
    }
    if (modo === '500') {
      return {
        ok: false,
        status: 500,
        json: async () => (nombre === 'Mailjet'
          ? { ErrorMessage: 'Mailjet 500 error interno' }
          : { message: `${nombre} 500 error interno` }),
      };
    }

    const { to, subject } = extraerDestinatarioYAsunto(nombre, opts.body);
    enviados.push({ proveedor: nombre, to, subject });
    return { ok: true, status: 200, json: async () => ({ id: `${nombre}-${enviados.length}` }) };
  }

  return {
    fetchFn,
    modos,
    conteos,
    abortadosPorTimeout,
    enviados,
    cerrarPendientes() {
      for (const t of timersActivos) clearTimeout(t);
      timersActivos.clear();
    },
    credencialesFalsas: {
      fromEmail: 'tefiis@prueba.test',
      brevo: { apiKey: 'test-brevo-key', url: URL_BREVO_DEFAULT },
      resend: { apiKey: 'test-resend-key', url: URL_RESEND_DEFAULT },
      mailjet: { apiKey: 'test-mj-key', secretKey: 'test-mj-secret', url: URL_MAILJET_DEFAULT },
    },
  };
}
