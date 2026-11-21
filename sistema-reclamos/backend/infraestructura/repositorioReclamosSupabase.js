/**
 * Adaptador PostgREST del puerto RepositorioReclamos.
 * @param {(path: string, opts?: object) => Promise<Response>} sbRest
 * @returns {import('../dominio/puertosReclamos.js').RepositorioReclamos}
 */
export function crearRepositorioReclamosSupabase(sbRest) {
  return {
    async buscarDuplicado(email, descripcion, desdeIso) {
      const r = await sbRest(`/reclamos?select=id,descripcion,created_at&email=eq.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(desdeIso)}&order=created_at.desc&limit=10`);
      if (!r.ok) return null;
      const filas = await r.json();
      const igual = filas.find((f) => String(f.descripcion || '').trim() === descripcion);
      return igual ? { id: igual.id, creadoEn: igual.created_at } : null;
    },

    async siguienteNumero() {
      try {
        const r = await sbRest('/rpc/siguiente_id_reclamo', { method: 'POST', body: '{}' });
        if (!r.ok) return null;
        const n = Number(await r.json());
        return Number.isFinite(n) ? n : null;
      } catch {
        return null;
      }
    },

    async ultimoIdDelAnio(anio) {
      const r = await sbRest(`/reclamos?select=id&id=like.REC-${anio}-*&order=id.desc&limit=1`);
      const filas = r.ok ? await r.json() : [];
      return filas[0]?.id ?? null;
    },

    async insertar(fila) {
      const r = await sbRest('/reclamos', {
        method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(fila),
      });
      if (r.ok) return { ok: true };
      const detalle = await r.text();
      // 409 / 23505: otro reclamo ganó ese id.
      return { ok: false, colision: r.status === 409 || detalle.includes('23505'), detalle };
    },

    async obtenerParaExpediente(id) {
      const r = await sbRest(`/reclamos?select=id,codigo_estudiante,email,nombre,categoria,descripcion&id=eq.${encodeURIComponent(id)}&limit=1`);
      if (!r.ok) throw new Error(await r.text());
      return (await r.json())[0] ?? null;
    },
  };
}
