-- Historial de correos enviados por reclamo (auditoría en el panel admin).
-- Ejecutar una sola vez en el SQL Editor de Supabase.

create table if not exists public.respuestas_reclamo (
  id           bigserial primary key,
  reclamo_id   text        not null,
  estado       text        not null,
  mensaje      text        not null,
  admin_email  text        not null,
  created_at   timestamptz not null default now()
);

-- El detalle de un reclamo lista su historial ordenado por fecha.
create index if not exists respuestas_reclamo_reclamo_id_idx
  on public.respuestas_reclamo (reclamo_id, created_at);

-- Sin políticas: con RLS activo y ninguna policy, la clave anónima no lee ni
-- escribe nada. Solo la service key del backend entra.
alter table public.respuestas_reclamo enable row level security;
