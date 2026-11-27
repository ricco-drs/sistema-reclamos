-- Datos y esquema sintéticos para los escenarios de reclamos de Lab11.
create role tefiis_lab nologin;

create table public.reclamos (
  id text primary key,
  email text not null,
  nombre text,
  codigo_estudiante text,
  categoria text not null,
  descripcion text not null,
  datos_estudiante jsonb,
  documentos jsonb,
  estado text not null default 'PENDIENTE',
  respuesta text,
  created_at timestamptz not null default now(),
  nombres text,
  codigo text,
  urls jsonb,
  datos_academicos jsonb
);

create index reclamos_email_fecha_idx on public.reclamos (email, created_at desc);

create sequence public.reclamos_numero;

create function public.siguiente_id_reclamo()
returns bigint language sql volatile
as $$ select nextval('public.reclamos_numero') $$;

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  actor_email text,
  actor_type text not null,
  accion text not null,
  detalle jsonb,
  created_at timestamptz not null default now()
);
