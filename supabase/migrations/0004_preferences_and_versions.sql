-- Phase 5: per-user editor preferences and a record of applied schema versions.
-- Additive only: one new column with a default, one new table. No data is changed.
-- Security summary:
--   * profiles.preferences is covered by the existing "own profile read/update" policies,
--     so a user can only read and change their own preferences.
--   * schema_versions holds migration names and timestamps only (no user data). It is
--     readable by anyone (so setup can be verified with the publishable key) and has no
--     write grants: only the SQL editor / migration owner can insert.

alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb
    check (jsonb_typeof(preferences) = 'object');

create table if not exists public.schema_versions (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_versions enable row level security;
revoke all on public.schema_versions from anon, authenticated;
grant select on public.schema_versions to anon, authenticated;
create policy "schema versions are public" on public.schema_versions
  for select to anon, authenticated using (true);

-- 0004 requires 0001–0003, so record all four.
insert into public.schema_versions (version)
values ('0001_init'), ('0002_brand_assets'), ('0003_motion_presets'), ('0004_preferences_and_versions')
on conflict (version) do nothing;

-- Accounts created before the schema existed (no signup trigger yet) get the same
-- profile + personal workspace + owner membership as new signups. Insert-only.
insert into public.profiles (id, display_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

do $backfill$
declare
  u record;
  ws_id uuid;
begin
  for u in
    select id from auth.users au
    where not exists (select 1 from public.workspace_members m where m.user_id = au.id)
  loop
    insert into public.workspaces (name, created_by) values ('My Workspace', u.id) returning id into ws_id;
    insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, u.id, 'owner');
  end loop;
end
$backfill$;
