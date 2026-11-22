// Envoltorio visual compartido por los correos transaccionales de TEFIIS.
// Es el mismo que tenía server.js (`emailTemplate` y sus tres URL de imagen), movido aquí
// para que la confirmación del reclamo se componga sin importar server.js.

export const EMAIL_LOGO_URL = 'https://sistema-tefiis.reclamos.workers.dev/Tefiis.png';
export const EMAIL_CODIGO_IMG_URL = 'https://sistema-tefiis.reclamos.workers.dev/codigo-enviado.png';
export const EMAIL_RECLAMO_IMG_URL = 'https://sistema-tefiis.reclamos.workers.dev/reclamo-recibido.png';

/** Escapa lo que se interpola en HTML: lo escribió el estudiante y puede traer <, > o &. */
export function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Header con logo + footer institucional. Usa tablas e inline styles (no <style> en <head>)
// porque es lo único que Gmail/Outlook renderizan de forma consistente.
export function emailTemplate(bodyHtml) {
  return `
    <div style="background:#f3f4f6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto">
        <tr>
          <td style="background:#ffffff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:28px 32px 16px;text-align:center;border-bottom:1px solid #f0f0f2">
                  <img src="${EMAIL_LOGO_URL}" width="48" height="48" alt="TEFIIS" style="display:block;margin:0 auto 10px" />
                  <span style="font-size:13px;font-weight:700;letter-spacing:2px;color:#2563EB">TEFIIS</span>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 32px">
                  ${bodyHtml}
                </td>
              </tr>
              <tr>
                <td style="padding:16px 32px 24px;border-top:1px solid #f0f0f2">
                  <p style="color:#aaa;font-size:11px;margin:12px 0 0;text-align:center">TEFIIS — Facultad de Ingeniería Industrial y de Sistemas, UNI</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}
