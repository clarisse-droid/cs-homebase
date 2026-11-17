-- Performance advisor fixes: evaluate auth.uid() once per query, scope policies to signed-in users,
-- and avoid overlapping permissive policies.
drop policy "self read" on app_users;
drop policy "admin manage users" on app_users;
drop policy "self last seen" on app_users;
create policy "self read" on app_users for select to authenticated using (id = (select auth.uid()) or (select is_admin()));
create policy "update users" on app_users for update to authenticated
  using ((select is_admin()) or id = (select auth.uid()))
  with check ((select is_admin()) or (id = (select auth.uid()) and role = (select app_role())));

drop policy "admin write" on rule_config;
create policy "admin insert" on rule_config for insert to authenticated with check ((select is_admin()));
create policy "admin update" on rule_config for update to authenticated using ((select is_admin())) with check ((select is_admin()));

create index on board_mappings(updated_by);
create index on cs_communications(created_by);
create index on cs_health(updated_by);
create index on cs_milestones(created_by);
create index on cs_notes(created_by);
create index on cs_tasks(created_by);
create index on rule_config(updated_by);
