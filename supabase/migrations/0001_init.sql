-- Customer Success HQ — initial schema
-- Two strictly separated zones:
--   source_*  : mirror of monday.com. Written ONLY by the sync job (service_role). App users can SELECT only.
--   cs_*      : Customer Success data owned by this app. Never synced back to monday.com.


-- ---------------------------------------------------------------- users & roles
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null default '',
  role text not null default 'viewer' check (role in ('admin','cs','viewer')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function app_role() returns text language sql stable security definer set search_path = public as $$
  select role from app_users where id = auth.uid()
$$;
create or replace function can_read() returns boolean language sql stable set search_path = public as $$ select coalesce(app_role() in ('admin','cs','viewer'), false) $$;
create or replace function can_write_cs() returns boolean language sql stable set search_path = public as $$ select coalesce(app_role() in ('admin','cs'), false) $$;
create or replace function is_admin() returns boolean language sql stable set search_path = public as $$ select coalesce(app_role() = 'admin', false) $$;

-- ---------------------------------------------------------------- source (monday mirror)
create table source_clients (
  monday_item_id text primary key,
  name text not null,
  master_status text,
  data jsonb not null,               -- allowlisted fields only (see src/lib/monday/source.ts)
  source_updated_at timestamptz,
  synced_at timestamptz not null default now()
);
create table source_units (
  monday_item_id text primary key,
  name text not null,
  data jsonb not null,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now()
);
create table source_boards (
  monday_board_id text primary key,
  name text not null,
  kind text not null check (kind in ('project','tech_onboarding')),
  data jsonb not null,
  synced_at timestamptz not null default now()
);
create table source_tasks (
  monday_item_id text primary key,
  board_id text not null references source_boards(monday_board_id) on delete cascade,
  parent_item_id text,
  name text not null,
  state text not null,
  data jsonb not null,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now()
);
create index on source_tasks(board_id);
create table source_actively_looking (client_id text primary key, synced_at timestamptz not null default now());

create table change_events (
  id text primary key,                -- deterministic hash: re-syncs never duplicate timeline events
  entity_type text not null,
  entity_id text not null,
  client_ids text[] not null default '{}',
  field text not null,
  previous_value text,
  new_value text,
  at timestamptz not null,
  source_url text,
  recorded_at timestamptz not null default now()
);
create index on change_events(at desc);
create index on change_events using gin(client_ids);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('incremental','full')),
  status text not null check (status in ('running','success','partial','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_read int not null default 0,
  changes int not null default 0,
  errors text[] not null default '{}'
);

-- ---------------------------------------------------------------- CS-owned
create table board_mappings (
  id text primary key,
  board_id text not null,
  client_id text not null,
  unit_ids text[] not null default '{}',
  status text not null check (status in ('suggested','confirmed','rejected')),
  confidence numeric not null default 0,
  reason text not null default '',
  updated_by uuid references app_users(id),
  updated_at timestamptz not null default now(),
  unique (board_id, client_id)
);

create table cs_tasks (
  id text primary key,
  client_id text,
  unit_id text,
  title text not null,
  notes text,
  priority text not null check (priority in ('low','medium','high','urgent')),
  due_date date,
  status text not null check (status in ('open','done')),
  is_escalation boolean not null default false,
  origin text not null check (origin in ('manual','ai_approved')),
  created_by uuid references app_users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on cs_tasks(client_id);

create table cs_notes (
  id text primary key,
  client_id text not null,
  kind text not null check (kind in ('note','concern','commitment','escalation','health')),
  body text not null,
  resolved boolean not null default false,
  due_date date,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index on cs_notes(client_id);

create table cs_communications (
  id text primary key,
  client_id text not null,
  channel text not null,
  direction text not null,
  summary text not null,
  occurred_at timestamptz not null,
  scheduled_for timestamptz,
  open_questions text[] not null default '{}',
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index on cs_communications(client_id);

create table cs_milestones (
  id text primary key,
  client_id text not null,
  stage text not null,
  completed_at date not null,
  note text not null default '',
  created_by uuid references app_users(id),
  unique (client_id, stage)
);

create table cs_health (
  client_id text primary key,
  health text not null check (health in ('excellent','good','neutral','at_risk','critical')),
  next_action text,
  updated_by uuid references app_users(id),
  updated_at timestamptz not null default now()
);

create table ai_suggestions (
  id text primary key,
  client_id text,
  title text not null,
  rationale text not null,
  priority text not null,
  status text not null check (status in ('pending','approved','dismissed')),
  rule_id text,
  created_at timestamptz not null default now()
);

create table ai_summaries (
  client_id text primary key,
  summary text not null,
  generated_at timestamptz not null,
  input_hash text not null,
  model text not null
);

create table rule_config (
  id int primary key default 1 check (id = 1),
  config jsonb not null,
  updated_by uuid references app_users(id),
  updated_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  entity text not null,
  detail text not null default ''
);
create index on audit_log(at desc);

-- ---------------------------------------------------------------- RLS
alter table app_users enable row level security;
alter table source_clients enable row level security;
alter table source_units enable row level security;
alter table source_boards enable row level security;
alter table source_tasks enable row level security;
alter table source_actively_looking enable row level security;
alter table change_events enable row level security;
alter table sync_runs enable row level security;
alter table board_mappings enable row level security;
alter table cs_tasks enable row level security;
alter table cs_notes enable row level security;
alter table cs_communications enable row level security;
alter table cs_milestones enable row level security;
alter table cs_health enable row level security;
alter table ai_suggestions enable row level security;
alter table ai_summaries enable row level security;
alter table rule_config enable row level security;
alter table audit_log enable row level security;

create policy "self read" on app_users for select using (id = auth.uid() or is_admin());
create policy "admin manage users" on app_users for update using (is_admin());
create policy "self last seen" on app_users for update using (id = auth.uid()) with check (id = auth.uid() and role = app_role());

-- Source zone: SELECT only. No insert/update/delete policies exist, so only service_role (sync job) can write.
create policy "read" on source_clients for select using (can_read());
create policy "read" on source_units for select using (can_read());
create policy "read" on source_boards for select using (can_read());
create policy "read" on source_tasks for select using (can_read());
create policy "read" on source_actively_looking for select using (can_read());
create policy "read" on change_events for select using (can_read());
create policy "read" on sync_runs for select using (can_read());

-- CS zone
do $$ declare t text; begin
  foreach t in array array['board_mappings','cs_tasks','cs_notes','cs_communications','cs_milestones','cs_health','ai_suggestions','ai_summaries'] loop
    execute format('create policy "read" on %I for select using (can_read())', t);
    execute format('create policy "write" on %I for insert with check (can_write_cs())', t);
    execute format('create policy "update" on %I for update using (can_write_cs()) with check (can_write_cs())', t);
  end loop;
end $$;
create policy "read" on rule_config for select using (can_read());
create policy "admin write" on rule_config for all using (is_admin()) with check (is_admin());
create policy "admin read" on audit_log for select using (is_admin());
-- No insert policy: rows come from triggers or log_audit(), which stamps the real caller (actor can't be forged).
create or replace function log_audit(p_action text, p_entity text, p_detail text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_read() then raise exception 'not allowed'; end if;
  insert into audit_log(actor, action, entity, detail)
  values ((select email from app_users where id = auth.uid()), left(p_action, 100), left(p_entity, 100), left(coalesce(p_detail, ''), 1000));
end $$;
revoke all on function log_audit(text, text, text) from public, anon;
grant execute on function log_audit(text, text, text) to authenticated;

-- Audit trigger on every CS table write (cannot be bypassed from the app)
create or replace function audit_cs() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log(actor, action, entity, detail)
  values (coalesce((select email from app_users where id = auth.uid()), 'service'), lower(tg_op), tg_table_name,
          coalesce(new.id::text, ''));
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['cs_tasks','cs_notes','cs_communications','cs_milestones','ai_suggestions','rule_config'] loop
    execute format('create trigger audit_%1$s after insert or update on %1$I for each row execute function audit_cs()', t);
  end loop;
end $$;
create trigger audit_board_mappings after insert or update on board_mappings for each row execute function audit_cs();

-- New auth users get a viewer profile; an admin promotes them (see docs/SETUP.md).
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into app_users(id, email, name) values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Trigger/helper functions are not meant to be called through the API by anonymous users.
revoke all on function handle_new_user() from public, anon, authenticated;
revoke all on function audit_cs() from public, anon, authenticated;
revoke execute on function app_role() from public, anon;
revoke execute on function can_read() from public, anon;
revoke execute on function can_write_cs() from public, anon;
revoke execute on function is_admin() from public, anon;
