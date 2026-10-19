-- Numeración de reclamos con una secuencia, para que un id borrado no se
-- vuelva a usar. Ejecutar una sola vez en el SQL Editor de Supabase.

create sequence if not exists public.reclamos_numero;

-- Arranca donde va la numeración actual, para no repetir ninguno ya emitido.
-- El valor sale del id más alto que existe hoy: REC-2026-0366.
select setval('public.reclamos_numero',
  greatest(
    coalesce((select max(split_part(id, '-', 3)::int) from public.reclamos), 0),
    366
  )
);

-- PostgREST solo expone funciones, no secuencias. Esta devuelve el siguiente
-- número de forma atómica: dos peticiones simultáneas nunca reciben el mismo.
create or replace function public.siguiente_id_reclamo()
returns bigint
language sql
volatile
as $$ select nextval('public.reclamos_numero') $$;

-- La llama el backend con la service key; nadie más necesita ejecutarla.
revoke execute on function public.siguiente_id_reclamo() from anon, authenticated;
