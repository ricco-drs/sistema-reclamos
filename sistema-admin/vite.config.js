import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import nodemailer from 'nodemailer';

function buildEmailHtml({ toName, reclamoId, categoria, descripcion, respuesta }) {
  return `
<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:ui-sans-serif,system-ui,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <div style="background:#0f172a;padding:28px 32px;display:flex;align-items:center;gap:12px;">
      <div style="width:8px;height:8px;border-radius:50%;background:#3b82f6;"></div>
      <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:0.04em;">TEFIIS — FIIS UNI</span>
    </div>

    <div style="padding:32px;">
      <h2 style="margin:0 0 4px;color:#0f172a;font-size:20px;">Hola, ${toName}</h2>
      <p style="margin:0 0 24px;color:#64748b;font-size:14px;">
        Respuesta a tu reclamo <strong style="color:#3b82f6;">${reclamoId}</strong>
      </p>

      <div style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin-bottom:16px;border-left:4px solid #3b82f6;">
        <p style="margin:0 0 4px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Categoría</p>
        <p style="margin:0;color:#1e293b;font-size:14px;">${categoria}</p>
      </div>

      <div style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0 0 8px;color:#94a3b8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Tu consulta</p>
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">${descripcion}</p>
      </div>

      <div style="background:#f0fdf4;border-radius:8px;padding:20px;border:1px solid #bbf7d0;">
        <p style="margin:0 0 10px;color:#15803d;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">✓ Respuesta del equipo TEFIIS</p>
        <p style="margin:0;color:#166534;font-size:15px;line-height:1.7;white-space:pre-wrap;">${respuesta}</p>
      </div>
    </div>

    <div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
        Este correo fue enviado automáticamente por el sistema TEFIIS.<br>
        No respondas directamente a este mensaje.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const emailPlugin = {
    name: 'email-api',
    configureServer(server) {
      server.middlewares.use('/api/send-email', (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405).end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS },
            });
            await transporter.sendMail({
              from: `"TEFIIS — FIIS UNI" <${env.EMAIL_USER}>`,
              to: data.to,
              subject: `Respuesta a tu reclamo ${data.reclamoId} — TEFIIS FIIS UNI`,
              html: buildEmailHtml(data),
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      });
    },
  };

  return {
    plugins: [react(), tailwindcss(), emailPlugin],
  };
});
