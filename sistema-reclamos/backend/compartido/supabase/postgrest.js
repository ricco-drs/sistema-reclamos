export const sbRest = (path, opts = {}) => fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, {
  ...opts,
  headers: {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    ...opts.headers,
  },
});

// PostgREST corta la respuesta en 1000 filas y se SALTA el `limit` mayor que se
// le pida, sin error y sin avisar: simplemente devuelve menos. Combinado con un
// `order=...asc` eso no recorta lo viejo sino lo NUEVO, que es como la columna
// "atendido por" acabó perdiendo justo el trabajo del día en cuanto el registro
// pasó de las 1000 filas. Aquí se pide por páginas con Range hasta agotar.
//
// El `path` no debe llevar `limit`: chocaría con el Range y volvería a truncar.
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
