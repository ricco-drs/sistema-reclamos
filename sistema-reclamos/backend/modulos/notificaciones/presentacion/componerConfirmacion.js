import { EMAIL_RECLAMO_IMG_URL, emailTemplate, escaparHtml } from '@tefiis/compartido';

// Formato peruano: "APELLIDO1 APELLIDO2, NOMBRE1 NOMBRE2" → el primer nombre, después de la coma.
// Si el nombre no trae coma, se usa la parte del correo antes del primer punto; sin correo, "Estudiante".
function primerNombreDe(nombre, email) {
  if (typeof nombre === 'string' && nombre.includes(',')) {
    const nombres = nombre.split(',')[1]?.trim();
    const primero = nombres?.split(' ').find((p) => p.length > 0) || '';
    if (primero) return escaparHtml(primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase());
  }
  const delCorreo = (email || '').split('@')[0].split('.')[0];
  return escaparHtml(delCorreo.charAt(0).toUpperCase() + delCorreo.slice(1).toLowerCase() || 'Estudiante');
}

/**
 * Correo de confirmación de un reclamo recién registrado. Es la plantilla de
 * `POST /api/reclamos/confirmar`, para que esa ruta y el consumidor de `ReclamoRegistrado`
 * (`crearNotificadorDeReclamo`) envíen exactamente el mismo mensaje.
 *
 * `email` es opcional: solo sirve para el saludo cuando `nombre` no tiene el formato
 * "APELLIDOS, NOMBRES". El consumidor lo recibe en el evento y lo pasa.
 *
 * @param {{id: string, nombre?: string|null, categoria?: string, email?: string}} reclamo
 * @returns {{subject: string, html: string}}
 */
export function componerConfirmacion({ id, nombre, categoria, email }) {
  const primerNombre = primerNombreDe(nombre, email);
  return {
    subject: `Reclamo registrado: ${id} — TEFIIS`,
    html: emailTemplate(`
        <img src="${EMAIL_RECLAMO_IMG_URL}" width="220" alt="Tu reclamo ha sido recibido" style="display:block;margin:0 auto 20px;max-width:220px;height:auto" />
        <h2 style="color:#1a1a1a;margin:0 0 8px;font-size:20px;text-align:center">Tu reclamo fue registrado</h2>
        <p style="color:#666;margin:0 0 20px;font-size:14px;line-height:1.5;text-align:center">Hola <strong>${primerNombre}</strong>, tu reclamo ha sido enviado correctamente a la FIIS.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 20px">
              <p style="margin:0;color:#166534;font-size:12px;font-weight:600;letter-spacing:0.5px">ID DE TU CASO</p>
              <p style="font-size:24px;font-weight:700;color:#111;margin:6px 0">${escaparHtml(id)}</p>
              <p style="margin:0;color:#4b5563;font-size:13px">Categoría: ${escaparHtml(categoria)}</p>
            </td>
          </tr>
        </table>
        <p style="color:#666;font-size:13px;margin:20px 0 0">Guarda este ID para consultar el estado de tu reclamo en cualquier momento desde TEFIIS.</p>
      `),
  };
}
