-- Read-only copy of client units from the rent Google Sheet (lease renewals + this month's rent).
-- Same rules as the other source_* tables: app users can only SELECT; only the sync job (service role) writes.
create table if not exists source_sheet_units (
  id int primary key check (id = 1),
  data jsonb not null,
  synced_at timestamptz not null default now()
);
alter table source_sheet_units enable row level security;
create policy "read" on source_sheet_units for select using (can_read());
