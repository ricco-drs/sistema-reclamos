-- Decisión del Tercio sobre qué cursos-sección se matriculan y cuáles se
-- retiran de verdad, que no tiene por qué coincidir con lo que pidió el
-- estudiante. Ejecutar una sola vez en el SQL Editor de Supabase.

alter table public.reclamos
  add column if not exists cursos_resueltos jsonb;

-- Forma del contenido:
--   {
--     "matricular":      [{ "codigo": "SW101", "nombre": "...", "seccion": "U" }],
--     "desmatricular":   [{ "codigo": "FB301", "nombre": "...", "seccion": "V" }],
--     "actualizadoPor":  "correo@uni.pe",
--     "actualizadoEn":   "2026-08-31T21:00:00.000Z",
--     "historial":       [{ "admin": "...", "fecha": "...", "matricular": [...], "desmatricular": [...] }]
--   }
--
-- NO se expone al estudiante: los dos endpoints que él consulta
-- (/api/reclamos/mine y /api/reclamos/mine/:id) piden columnas por nombre y
-- arman la respuesta campo a campo, así que esta columna nunca sale de ahí.

-- Para contar cuántos van por sección hay que recorrer el jsonb de todos los
-- reclamos; con el índice no hace falta leer la tabla entera.
create index if not exists reclamos_cursos_resueltos_idx
  on public.reclamos using gin (cursos_resueltos);
