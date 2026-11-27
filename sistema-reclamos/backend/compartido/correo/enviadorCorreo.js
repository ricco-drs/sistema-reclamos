/**
 * Adaptador de envío de correo con corte por tiempo de espera (Timeout) y Circuit Breaker
 * (`opossum`) en cada proveedor sobre la cadena de respaldo en cascada (Brevo -> Resend -> Mailjet).
 *
 * Atiende el escenario E5 (Confiabilidad ante falla, lentitud o bloqueo del proveedor de correo):
 * - Las URL y credenciales se leen en cada envío desde las opciones o desde `process.env`
 *   (`BREVO_API_URL`, `RESEND_API_URL`, `MAILJET_API_URL`), de modo que no dependen del
 *   orden en que se cargue `dotenv` y permiten redirigir el tráfico a un servidor falso en
 *   pruebas o en Docker Compose sin gastar cuota real ni tocar producción.
 * - Cada llamada HTTP aplica `AbortSignal.timeout(timeoutMs)` (por defecto 3 000 ms; `0`
 *   desactiva el timeout) para que un proveedor colgado o lento no bloquee indefinidamente
 *   la espera e impida conmutar al siguiente proveedor.
 * - Cada proveedor está protegido por un `CircuitBreaker` de `opossum` (activo por defecto;
 *   desactivable con `circuitBreaker: false` o `EMAIL_CB_ENABLED=false` para pruebas antes/después).
 *   Cuando un proveedor alcanza el volumen mínimo (`volumeThreshold`) y supera el porcentaje
 *   de fallos (`errorThresholdPercentage`) dentro de la ventana deslizante (`rollingCountTimeout`,
 *   por defecto 60 000 ms), el circuito se abre y los siguientes envíos saltan directo al
 *   siguiente proveedor en memoria sin esperar un nuevo timeout. Los errores atribuibles a la
 *   petición o al destinatario (`400` y `422`) se excluyen mediante `errorFilter` para que una
 *   dirección inválida no abra los circuitos ni bloquee el correo de otros usuarios.
 */

import CircuitBreaker from 'opossum';

export const URL_BREVO_DEFAULT = 'https://api.brevo.com/v3/smtp/email';
export const URL_RESEND_DEFAULT = 'https://api.resend.com/emails';
export const URL_MAILJET_DEFAULT = 'https://api.mailjet.com/v3.1/send';

function resolverBoolEnv(valor, defecto) {
  if (valor === undefined || valor === '') return defecto;
  const normalizado = String(valor).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalizado)) return false;
  if (['true', '1', 'si', 'sí', 'on'].includes(normalizado)) return true;
  return defecto;
}

function resolverNumeroPositivo(valor, defecto) {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : defecto;
}

function crearErrorHttpProveedor(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

/**
 * Crea la función `sendEmail({ to, subject, html })` con Timeout, Circuit Breaker (`opossum`)
 * por proveedor y Fallback en cascada.
 *
 * @param {Object} [opciones]
 * @param {typeof fetch} [opciones.fetchFn]
 * @param {number} [opciones.timeoutMs] Tiempo máximo por proveedor en ms (`0` desactiva el timeout).
 * @param {boolean|{habilitado?: boolean, volumeThreshold?: number, errorThresholdPercentage?: number, resetTimeout?: number, rollingCountTimeout?: number, rollingCountBuckets?: number}} [opciones.circuitBreaker]
 * @param {string} [opciones.fromEmail]
 * @param {{apiKey?: string, url?: string}} [opciones.brevo]
 * @param {{apiKey?: string, url?: string}} [opciones.resend]
 * @param {{apiKey?: string, secretKey?: string, url?: string}} [opciones.mailjet]
 * @param {(proveedor: string, err: Error) => void} [opciones.registrarError]
 * @param {(proveedor: string, estado: string) => void} [opciones.registrarEstadoCircuito]
 */
export function crearEnviadorCorreo(opciones = {}) {
  const {
    fetchFn = fetch,
    registrarError = (nombre, err) =>
      console.error(`[EMAIL] ${nombre} falló, probando el siguiente proveedor:`, err.message),
    registrarEstadoCircuito = (nombre, estado) =>
      console.warn(`[EMAIL][CB] Circuito de ${nombre} pasó a estado: ${estado}`),
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
      throw crearErrorHttpProveedor(err.message || `Brevo error ${res.status}`, res.status);
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
      throw crearErrorHttpProveedor(err.message || `Resend error ${res.status}`, res.status);
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
      throw crearErrorHttpProveedor(err.ErrorMessage || `Mailjet error ${res.status}`, res.status);
    }
  }

  const cbOpt = opciones.circuitBreaker;
  const cbHabilitado = cbOpt === false
    ? false
    : (typeof cbOpt === 'object' && cbOpt !== null && cbOpt.habilitado !== undefined
      ? Boolean(cbOpt.habilitado)
      : resolverBoolEnv(process.env.EMAIL_CB_ENABLED, true));

  const cbConfig = {
    // El timeout HTTP por proveedor se controla explícitamente con AbortSignal.timeout(timeoutMs).
    timeout: false,
    volumeThreshold: resolverNumeroPositivo(
      typeof cbOpt === 'object' && cbOpt !== null ? cbOpt.volumeThreshold : undefined,
      resolverNumeroPositivo(process.env.EMAIL_CB_VOLUME_THRESHOLD, 3),
    ),
    errorThresholdPercentage: resolverNumeroPositivo(
      typeof cbOpt === 'object' && cbOpt !== null ? cbOpt.errorThresholdPercentage : undefined,
      resolverNumeroPositivo(process.env.EMAIL_CB_ERROR_THRESHOLD, 50),
    ),
    resetTimeout: resolverNumeroPositivo(
      typeof cbOpt === 'object' && cbOpt !== null ? cbOpt.resetTimeout : undefined,
      resolverNumeroPositivo(process.env.EMAIL_CB_RESET_MS, 30_000),
    ),
    rollingCountTimeout: resolverNumeroPositivo(
      typeof cbOpt === 'object' && cbOpt !== null ? cbOpt.rollingCountTimeout : undefined,
      resolverNumeroPositivo(process.env.EMAIL_CB_WINDOW_MS, 60_000),
    ),
    rollingCountBuckets: resolverNumeroPositivo(
      typeof cbOpt === 'object' && cbOpt !== null ? cbOpt.rollingCountBuckets : undefined,
      10,
    ),
    // Errores de la petición o destinatario (400, 422) no cuentan como caída del proveedor.
    // Los timeouts, 401, 429 y 5xx devuelven false en errorFilter y sí cuentan para abrir el circuito.
    errorFilter: (err) => err?.status === 400 || err?.status === 422,
  };

  const crearRompedor = (nombre, fn) => {
    const breaker = new CircuitBreaker(fn, {
      name: `correo-${nombre.toLowerCase()}`,
      ...cbConfig,
    });
    breaker.on('open', () => registrarEstadoCircuito(nombre, 'open'));
    breaker.on('halfOpen', () => registrarEstadoCircuito(nombre, 'halfOpen'));
    breaker.on('close', () => registrarEstadoCircuito(nombre, 'close'));
    return breaker;
  };

  const rompedores = cbHabilitado
    ? {
        Brevo: crearRompedor('Brevo', enviarPorBrevo),
        Resend: crearRompedor('Resend', enviarPorResend),
        Mailjet: crearRompedor('Mailjet', enviarPorMailjet),
      }
    : null;

  async function sendEmail({ to, subject, html }) {
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
        if (rompedores) {
          await rompedores[proveedor.nombre].fire({ to: cleanEmail, subject, html, timeoutMs });
        } else {
          await proveedor.enviar({ to: cleanEmail, subject, html, timeoutMs });
        }
        return { proveedor: proveedor.nombre };
      } catch (err) {
        const esTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        const esCircuitoAbierto = err?.code === 'EOPENBREAKER';
        let errorNormalizado = err;
        if (esTimeout) {
          errorNormalizado = new Error(`${proveedor.nombre} excedió el tiempo límite de ${timeoutMs} ms`);
        } else if (esCircuitoAbierto) {
          errorNormalizado = new Error(`Circuito abierto para ${proveedor.nombre}: se omite el intento y se pasa al respaldo`);
        }
        registrarError(proveedor.nombre, errorNormalizado);
        ultimoError = errorNormalizado;
      }
    }
    throw ultimoError || new Error('No hay proveedores de correo configurados.');
  }

  sendEmail.estadoCircuitos = () => {
    if (!rompedores) {
      return { Brevo: 'disabled', Resend: 'disabled', Mailjet: 'disabled' };
    }
    const estadoDe = (b) => (b.opened ? 'open' : (b.halfOpen ? 'halfOpen' : 'closed'));
    return {
      Brevo: estadoDe(rompedores.Brevo),
      Resend: estadoDe(rompedores.Resend),
      Mailjet: estadoDe(rompedores.Mailjet),
    };
  };

  sendEmail.cerrar = () => {
    if (!rompedores) return;
    Object.values(rompedores).forEach((b) => b.shutdown());
  };

  return sendEmail;
}
