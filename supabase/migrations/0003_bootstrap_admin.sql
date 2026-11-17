-- The first administrator is promoted automatically when invited; everyone else starts as viewer.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into app_users(id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''),
          case when lower(new.email) = 'clarisse@stayvacarya.com' then 'admin' else 'viewer' end)
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function handle_new_user() from public, anon, authenticated;
