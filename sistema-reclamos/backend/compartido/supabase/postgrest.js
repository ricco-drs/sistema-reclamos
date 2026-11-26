export const sbRest = (path, opts = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, {
  ...opts,
  headers: {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    ...opts.headers,
  },
});

// PostgREST limita cada respuesta a 1 000 filas. El path debe omitir limit
// para que la cabecera Range pueda avanzar de una página a otra.
const PAGINA_SB = 1000;
export async function sbRestTodo(path, tope = 50000) {
  const filas = [];
  for (let desde = 0; desde < tope; desde += PAGINA_SB) {
    const r = await sbRest(path, {
      headers: { 'Range-Unit': 'items', 'Range': `${desde}-${desde + PAGINA_SB - 1}` },
    });
    if (!r.ok) return { ok: false, respuesta: r };
    const lote = await r.json();
    filas.push(...lote);
    // Una página incompleta significa que ya no queda nada detrás.
    if (lote.length < PAGINA_SB) break;
  }
  return { ok: true, filas };
}
