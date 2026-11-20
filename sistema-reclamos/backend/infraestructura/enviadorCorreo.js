/**
 * Adaptador resiliente de envío de correo con respaldo en cascada (Brevo -> Resend -> Mailjet)
 * y corte por tiempo de espera (Timeout) en cada proveedor.
 *
 * Atiende el escenario E5 (Confiabilidad ante falla o lentitud del proveedor de correo):
 * - Las URL de los tres proveedores son configurables para redirigirlas a un servidor falso
 *   en pruebas o en Docker Compose sin gastar cuota real ni tocar producción.
 * - Cada llamada HTTP aplica `AbortSignal.timeout(timeoutMs)` (por defecto 3 000 ms) para
 *   que un proveedor colgado o lento no bloquee la petición ni impida conmutar al siguiente.
 */

export const URL_BREVO_DEFAULT = 'https://api.brevo.com/v3/smtp/email';
export const URL_RESEND_DEFAULT = 'https://api.resend.com/emails';
export const URL_MAILJET_DEFAULT = 'https://api.mailjet.com/v3.1/send';

/**
 * Crea la función `sendEmail({ to, subject, html })` con Timeout + Fallback en cascada.
 *
 * @param {Object} [opciones]
 * @param {typeof fetch} [opciones.fetchFn]
 * @param {number} [opciones.timeoutMs] Tiempo máximo por proveedor en ms (0 = sin timeout, para reproducir el "antes").
 * @param {string} [opciones.fromEmail]
 * @param {{apiKey?: string, url?: string}} [opciones.brevo]
 * @param {{apiKey?: string, url?: string}} [opciones.resend]
 * @param {{apiKey?: string, secretKey?: string, url?: string}} [opciones.mailjet]
 * @param {(proveedor: string, err: Error) => void} [opciones.registrarError]
 */
export function crearEnviadorCorreo({
  fetchFn = fetch,
  timeoutMs = 3_000,
  fromEmail = process.env.FROM_EMAIL || 'tefiis@uni.pe',
  brevo = {
    apiKey: process.env.BREVO_API_KEY,
    url: process.env.BREVO_API_URL || URL_BREVO_DEFAULT,
  },
  resend = {
    apiKey: process.env.RESEND_API_KEY,
    url: process.env.RESEND_API_URL || URL_RESEND_DEFAULT,
  },
  mailjet = {
    apiKey: process.env.MAILJET_API_KEY,
    secretKey: process.env.MAILJET_SECRET_KEY,
    url: process.env.MAILJET_API_URL || URL_MAILJET_DEFAULT,
  },
  registrarError = (nombre, err) =>
    console.error(`[EMAIL] ${nombre} falló, probando el siguiente proveedor:`, err.message),
} = {}) {
  const signalDe = () => (timeoutMs && timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined);

  async function enviarPorBrevo({ to, subject, html }) {
    const res = await fetchFn(brevo.url || URL_BREVO_DEFAULT, {
      method: 'POST',
      headers: {
        'api-key': brevo.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'TEFIIS · FIIS UNI', email: fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
      signal: signalDe(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Brevo error ${res.status}`);
    }
  }

  async function enviarPorResend({ to, subject, html }) {
    const res = await fetchFn(resend.url || URL_RESEND_DEFAULT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `TEFIIS · FIIS UNI <${fromEmail}>`,
        to: [to],
        subject,
        html,
      }),
      signal: signalDe(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Resend error ${res.status}`);
    }
  }

  async function enviarPorMailjet({ to, subject, html }) {
    const auth = Buffer.from(`${mailjet.apiKey}:${mailjet.secretKey}`).toString('base64');
    const res = await fetchFn(mailjet.url || URL_MAILJET_DEFAULT, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Messages: [{
          From: { Email: fromEmail, Name: 'TEFIIS · FIIS UNI' },
          To: [{ Email: to }],
          Subject: subject,
          HTMLPart: html,
        }],
      }),
      signal: signalDe(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.ErrorMessage || `Mailjet error ${res.status}`);
    }
  }

  return async function sendEmail({ to, subject, html }) {
    const cleanEmail = typeof to === 'string' ? to.trim().toLowerCase() : '';
    if (!cleanEmail) {
      throw new Error('No se especificó un correo destinatario válido.');
    }

    const proveedores = [
      { nombre: 'Brevo', enviar: enviarPorBrevo, disponible: Boolean(brevo?.apiKey) },
      { nombre: 'Resend', enviar: enviarPorResend, disponible: Boolean(resend?.apiKey) },
      { nombre: 'Mailjet', enviar: enviarPorMailjet, disponible: Boolean(mailjet?.apiKey && mailjet?.secretKey) },
    ].filter((p) => p.disponible);

    let ultimoError = null;
    for (const proveedor of proveedores) {
      try {
        await proveedor.enviar({ to: cleanEmail, subject, html });
        return { proveedor: proveedor.nombre };
      } catch (err) {
        const esTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        const errorNormalizado = esTimeout
          ? new Error(`${proveedor.nombre} excedió el tiempo límite de ${timeoutMs} ms`)
          : err;
        registrarError(proveedor.nombre, errorNormalizado);
        ultimoError = errorNormalizado;
      }
    }
    throw ultimoError || new Error('No hay proveedores de correo configurados.');
  };
}

/**
 * Proveedor simulado local de las tres APIs de correo (Brevo, Resend y Mailjet) para el
 * experimento de resiliencia (Lab11 / E5) sin tocar la red ni gastar cuota real.
 *
 * Modos soportados por proveedor:
 * - `'ok'`: responde 200 de inmediato y registra el envío.
 * - `'401'`: responde 401 (clave inválida).
 * - `'429'`: responde 429 (cuota diaria agotada).
 * - `'500'`: responde 500 (caída del servidor).
 * - `'lento'`: demora `demoraLentoMs` antes de responder 200; si la petición trae un
 *   `AbortSignal` con timeout menor, rechaza con `TimeoutError` al dispararse la señal.
 *
 * @param {Object} [opciones]
 * @param {'ok'|'401'|'429'|'500'|'lento'} [opciones.Brevo]
 * @param {'ok'|'401'|'429'|'500'|'lento'} [opciones.Resend]
 * @param {'ok'|'401'|'429'|'500'|'lento'} [opciones.Mailjet]
 * @param {number} [opciones.demoraLentoMs]
 */
export function crearProveedorCorreoSimulado({
  Brevo = 'ok',
  Resend = 'ok',
  Mailjet = 'ok',
  demoraLentoMs = 200,
} = {}) {
  const modos = { Brevo, Resend, Mailjet };
  const conteos = { Brevo: 0, Resend: 0, Mailjet: 0 };
  const abortadosPorTimeout = { Brevo: 0, Resend: 0, Mailjet: 0 };
  const enviados = [];

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

  function esperarConSignal(ms, signal, nombre) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        abortadosPorTimeout[nombre]++;
        const err = new Error(`The operation was aborted due to timeout`);
        err.name = 'TimeoutError';
        reject(err);
        return;
      }
      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      function onAbort() {
        clearTimeout(timer);
        abortadosPorTimeout[nombre]++;
        const err = new Error(`The operation was aborted due to timeout`);
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
      await esperarConSignal(demoraLentoMs, opts.signal, nombre);
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
    credencialesFalsas: {
      brevo: { apiKey: 'test-brevo-key', url: URL_BREVO_DEFAULT },
      resend: { apiKey: 'test-resend-key', url: URL_RESEND_DEFAULT },
      mailjet: { apiKey: 'test-mj-key', secretKey: 'test-mj-secret', url: URL_MAILJET_DEFAULT },
    },
  };
}
