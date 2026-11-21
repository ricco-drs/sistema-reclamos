grant usage on schema public to tefiis_lab;
grant select, insert, update, delete on public.reclamos to tefiis_lab;
grant select, insert, update on public.app_settings to tefiis_lab;
grant select, insert on public.activity_log, public.respuestas_reclamo to tefiis_lab;
grant usage on all sequences in schema public to tefiis_lab;

revoke all on function public.siguiente_id_reclamo() from public;
grant execute on function public.siguiente_id_reclamo() to tefiis_lab;

create policy respuestas_lab on public.respuestas_reclamo to tefiis_lab
  using (true) with check (true);
