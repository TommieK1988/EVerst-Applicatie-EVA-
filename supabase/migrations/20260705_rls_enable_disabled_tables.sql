-- Vier tabellen hadden RLS volledig UITGESCHAKELD → leesbaar met de kale anon-key
-- (nog erger dan een using(true)-policy). RLS aangezet + platform-policy, consistent
-- met de baseline. Het betreft reference/config-data (BTW-tarieven, Bouw7 vrije dagen,
-- uursoort-tariefoverrides, task-todo-sync); alle server-reads lopen via admin/sessie
-- en alle huidige logins zijn platform_gebruiker, dus niets breekt.
do $$
declare t text;
begin
  foreach t in array array['task_todo_sync','uursoort_tarief_overrides','btw_tarieven','bouw7_vrije_dagen'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists platform_gebruikers_all on public.%I', t);
    execute format('create policy platform_gebruikers_all on public.%I for all to authenticated using (is_platform_gebruiker()) with check (is_platform_gebruiker())', t);
  end loop;
end $$;
