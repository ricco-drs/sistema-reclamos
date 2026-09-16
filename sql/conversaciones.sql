-- Auditoría de conversaciones con Tefi.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

create table if not exists public.conversaciones (
  id               bigserial primary key,
  email            text        not null,
  -- Agrupa los turnos de una misma sesión de chat para poder leerlos como hilo.
  conversacion_id  text        not null,
  pregunta         text        not null,
  respuesta        text        not null,
  created_at       timestamptz not null default now()
);

-- El listado ordena por estudiante y fecha; el detalle filtra por email.
create index if not exists conversaciones_email_fecha_idx
  on public.conversaciones (email, created_at desc);

-- El detalle agrupa por hilo.
create index if not exists conversaciones_hilo_idx
  on public.conversaciones (conversacion_id, created_at);

-- Sin políticas: con RLS activo y ninguna policy, la clave anónima no lee ni
-- escribe nada. Solo la service key del backend entra, que es lo que se quiere:
-- aquí hay conversaciones personales de los estudiantes.
alter table public.conversaciones enable row level security;
