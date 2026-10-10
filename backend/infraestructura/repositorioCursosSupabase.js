export function crearRepositorioCursosSupabase(sbRest) {
  return {
    async obtener(id) {
      const r = await sbRest(`/reclamos?id=eq.${encodeURIComponent(id)}&select=cursos_resueltos`);
      if (!r.ok) {
        const texto = await r.text();
        if (texto.includes('cursos_resueltos')) {
          throw new Error('Falta la columna cursos_resueltos: ejecuta sql/cursos_resueltos.sql en Supabase.');
        }
        throw new Error(texto);
      }
      return (await r.json())[0] ?? null;
    },
    async guardar(id, valor) {
      const r = await sbRest(`/reclamos?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ cursos_resueltos: valor }),
      });
      if (!r.ok) throw new Error(await r.text());
      const filas = await r.json().catch(() => []);
      return Array.isArray(filas) && filas.length > 0;
    },
  };
}
