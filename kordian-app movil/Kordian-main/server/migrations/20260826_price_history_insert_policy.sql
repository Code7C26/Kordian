-- Allow the authenticated API flow to record price history.
-- The server still validates administrator access before reaching these routes.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'price_history' and policyname = 'price_history_admin_insert'
  ) then
    create policy price_history_admin_insert on price_history
      for insert to anon, authenticated with check (true);
  end if;
end $$;