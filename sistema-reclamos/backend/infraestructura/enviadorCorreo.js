/**
 * Adaptador de envío de correo con corte por tiempo de espera (Timeout) en cada proveedor
 * sobre la cadena de respaldo en cascada (Brevo -> Resend -> Mailjet).
 *
 * Atiende el escenario E5 (Confiabilidad ante falla, lentitud o bloqueo del proveedor de correo):
 * - Las URL y credenciales se leen en cada envío desde las opciones o desde `process.env`
 *   (`BREVO_API_URL`, `RESEND_API_URL`, `MAILJET_API_URL`), de modo que no dependen del
 *   orden en que se cargue `dotenv` y permiten redirigir el tráfico a un servidor falso en
 *   pruebas o en Docker Compose sin gastar cuota real ni tocar producción.
 * - Cada llamada HTTP aplica `AbortSignal.timeout(timeoutMs)` (por defecto 3 000 ms; `0`
 *   desactiva el timeout) para que un proveedor colgado o lento no bloquee indefinidamente
 *   la espera e impida conmutar al siguiente proveedor.
 */

export const URL_BREVO_DEFAULT = 'https://api.brevo.com/v3/smtp/email';
export const URL_RESEND_DEFAULT = 'https://api.resend.com/emails';
export const URL_MAILJET_DEFAULT = 'https://api.mailjet.com/v3.1/send';

/**
 * Crea la función `sendEmail({ to, subject, html })` con Timeout por proveedor y Fallback en cascada.
 * Se activa en el servidor al conectarla en `backend/server.js` en reemplazo de `sendViaBrevo`,
 * `sendViaResend`, `sendViaMailjet` y `sendEmail`.
 *
 * @param {Object} [opciones]
 * @param {typeof fetch} [opciones.fetchFn]
 * @param {number} [opciones.timeoutMs] Tiempo máximo por proveedor en ms (`0` desactiva el timeout).
 * @param {string} [opciones.fromEmail]
 * @param {{apiKey?: string, url?: string}} [opciones.brevo]
 * @param {{apiKey?: string, url?: string}} [opciones.resend]
 * @param {{apiKey?: string, secretKey?: string, url?: string}} [opciones.mailjet]
 * @param {(proveedor: string, err: Error) => void} [opciones.registrarError]
 */
export function crearEnviadorCorreo(opciones = {}) {
  const {
    fetchFn = fetch,
    registrarError = (nombre, err) =>
      console.error(`[EMAIL] ${nombre} falló, probando el siguiente proveedor:`, err.message),
  } = opciones;

  const resolverTimeoutMs = () => {
    if (opciones.timeoutMs !== undefined) return Number(opciones.timeoutMs);
    if (process.env.EMAIL_TIMEOUT_MS !== undefined) return Number(process.env.EMAIL_TIMEOUT_MS);
    return 3_000;
  };

  const signalDe = (ms) => (Number.isFinite(ms) && ms > 0 ? AbortSignal.timeout(ms) : undefined);

  const resolverFromEmail = () => opciones.fromEmail ?? process.env.FROM_EMAIL;

  const resolverBrevo = () => ({
    apiKey: opciones.brevo?.apiKey ?? process.env.BREVO_API_KEY,
    url: opciones.brevo?.url ?? process.env.BREVO_API_URL ?? URL_BREVO_DEFAULT,
  });

  const resolverResend = () => ({
    apiKey: opciones.resend?.apiKey ?? process.env.RESEND_API_KEY,
    url: opciones.resend?.url ?? process.env.RESEND_API_URL ?? URL_RESEND_DEFAULT,
  });

  const resolverMailjet = () => ({
    apiKey: opciones.mailjet?.apiKey ?? process.env.MAILJET_API_KEY,
    secretKey: opciones.mailjet?.secretKey ?? process.env.MAILJET_SECRET_KEY,
    url: opciones.mailjet?.url ?? process.env.MAILJET_API_URL ?? URL_MAILJET_DEFAULT,
  });

  async function enviarPorBrevo({ to, subject, html, timeoutMs }) {
    const cfg = resolverBrevo();
    const fromEmail = resolverFromEmail();
    const res = await fetchFn(cfg.url, {
      method: 'POST',
      headers: {
        'api-key': cfg.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'TEFIIS · FIIS UNI', email: fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
      signal: signalDe(timeoutMs),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Brevo error ${res.status}`);
    }
  }

  async function enviarPorResend({ to, subject, html, timeoutMs }) {
    const cfg = resolverResend();
    const fromEmail = resolverFromEmail();
    const res = await fetchFn(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `TEFIIS · FIIS UNI <${fromEmail}>`,
        to: [to],
        subject,
        html,
      }),
      signal: signalDe(timeoutMs),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Resend error ${res.status}`);
    }
  }

  async function enviarPorMailjet({ to, subject, html, timeoutMs }) {
    const cfg = resolverMailjet();
    const fromEmail = resolverFromEmail();
    const auth = Buffer.from(`${cfg.apiKey}:${cfg.secretKey}`).toString('base64');
    const res = await fetchFn(cfg.url, {
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
      signal: signalDe(timeoutMs),
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

    const brevoCfg = resolverBrevo();
    const resendCfg = resolverResend();
    const mailjetCfg = resolverMailjet();
    const timeoutMs = resolverTimeoutMs();

    const proveedores = [
      { nombre: 'Brevo', enviar: enviarPorBrevo, disponible: Boolean(brevoCfg.apiKey) },
      { nombre: 'Resend', enviar: enviarPorResend, disponible: Boolean(resendCfg.apiKey) },
      { nombre: 'Mailjet', enviar: enviarPorMailjet, disponible: Boolean(mailjetCfg.apiKey && mailjetCfg.secretKey) },
    ].filter((p) => p.disponible);

    let ultimoError = null;
    for (const proveedor of proveedores) {
      try {
        await proveedor.enviar({ to: cleanEmail, subject, html, timeoutMs });
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
