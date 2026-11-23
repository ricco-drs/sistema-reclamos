import http from 'node:http';
import { setTimeout as esperar } from 'node:timers/promises';

const modosCorreo = new Map([
  ['/brevo', process.env.BREVO_MODO ?? 'ok'],
  ['/resend', process.env.RESEND_MODO ?? 'ok'],
  ['/mailjet', process.env.MAILJET_MODO ?? 'ok'],
]);
const modosValidosCorreo = new Set(['ok', '401', '429', '500', 'lento']);
const demoraMs = Number(process.env.DEMORA_CORREO_MS ?? 2000);
const modoM2 = process.env.M2_MODO ?? 'ok';
if ([...modosCorreo.values()].some(modo => !modosValidosCorreo.has(modo)) ||
    !Number.isInteger(demoraMs) || demoraMs < 1 || !['ok', '502'].includes(modoM2)) {
  throw new Error('Configuración inválida de los simuladores de eventos.');
}

const correo = [];
const expedientes = [];
const formatos = {
  '/brevo': (body) => ({ email: body.to?.[0]?.email, asunto: body.subject }),
  '/resend': (body) => ({ email: body.to?.[0], asunto: body.subject }),
  '/mailjet': (body) => ({
    email: body.Messages?.[0]?.To?.[0]?.Email,
    asunto: body.Messages?.[0]?.Subject,
  }),
};

function responder(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function leerJson(req) {
  const partes = [];
  for await (const parte of req) partes.push(parte);
  return JSON.parse(Buffer.concat(partes).toString('utf8'));
}

async function recibirCorreo(res, ruta, body) {
  const { email, asunto } = formatos[ruta](body);
  if (typeof email !== 'string' || typeof asunto !== 'string') {
    return responder(res, 400, { message: 'Falta el destinatario o el asunto.' });
  }
  const modo = modosCorreo.get(ruta);
  const intento = { proveedor: ruta.slice(1), email, asunto, resultado: 'pendiente' };
  correo.push(intento);

  if (modo === 'lento') {
    const espera = new AbortController();
    res.once('close', () => espera.abort());
    try {
      await esperar(demoraMs, undefined, { signal: espera.signal });
    } catch (error) {
      if (error.name !== 'AbortError') throw error;
      intento.resultado = 'interrumpido';
      return;
    }
  }

  const status = modo === 'ok' || modo === 'lento' ? 200 : Number(modo);
  intento.resultado = status;
  const mensaje = `${intento.proveedor} simulado respondió ${status}`;
  responder(res, status, { message: mensaje, ErrorMessage: mensaje });
}

const servidor = http.createServer(async (req, res) => {
  const ruta = req.url;
  if (req.method === 'GET' && ruta === '/health') return responder(res, 200, { ok: true });
  if (req.method === 'GET' && ruta === '/eventos') return responder(res, 200, { correo, expedientes });
  if (req.method !== 'POST' || !(modosCorreo.has(ruta) || ruta === '/m2')) {
    return responder(res, 404, { error: 'Ruta de simulación desconocida.' });
  }

  let body;
  try {
    body = await leerJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('JSON inválido');
  } catch {
    if (!res.destroyed) responder(res, 400, { error: 'Se requiere un objeto JSON.' });
    return;
  }

  if (modosCorreo.has(ruta)) {
    await recibirCorreo(res, ruta, body);
    return;
  }
  if (typeof body.id !== 'string' || typeof body.email !== 'string' || typeof body.descripcion !== 'string') {
    return responder(res, 400, { error: 'Expediente incompleto.' });
  }
  const status = modoM2 === 'ok' ? 200 : 502;
  expedientes.push({ status, expediente: body });
  responder(res, status, { ok: status === 200 });
});

servidor.listen(8081, '0.0.0.0');
