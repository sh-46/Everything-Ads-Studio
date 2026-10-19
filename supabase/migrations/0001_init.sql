-- Everything Ads Studio — initial schema
-- Security summary (see docs/ARCHITECTURE.md §2):
--   * RLS enabled on every table; only `authenticated` is granted privileges.
--   * Rows are visible to members of the owning workspace; viewers read, owners/editors write.
--   * Membership helpers are SECURITY DEFINER (empty search_path) so policies on other
--     tables can consult workspace_members without recursive RLS evaluation.
--   * Private storage bucket `assets`; object access is limited to the workspace folder.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index brands_workspace_idx on public.brands (workspace_id);

create table public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null unique,
  workspace_id uuid not null,
  kit jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now(),
  foreign key (brand_id, workspace_id) references public.brands (id, workspace_id) on delete cascade
);

create table public.model_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  brand_id uuid not null,
  name text not null check (char_length(name) between 1 and 160),
  model_year integer not null check (model_year between 1900 and 2100),
  model_name text not null check (char_length(model_name) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved')),
  brand_kit_overrides jsonb not null default '{}'::jsonb,
  export_config jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  last_edited_at timestamptz not null default now(),
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (brand_id, workspace_id) references public.brands (id, workspace_id) on delete cascade
);
create index model_projects_workspace_recent_idx on public.model_projects (workspace_id, last_edited_at desc);
create index model_projects_brand_idx on public.model_projects (brand_id);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  workspace_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('intro', 'exterior', 'interior', 'performance', 'outro', 'feed', 'cta', 'custom')),
  position integer not null,
  document jsonb not null,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.model_projects (id, workspace_id) on delete cascade
);
create index scenes_project_idx on public.scenes (project_id, position);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid,
  project_id uuid,
  kind text not null check (kind in ('photo', 'logo', 'font')),
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0),
  width integer,
  height integer,
  original_filename text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Composite FKs keep assets inside the same workspace as their brand/project.
  foreign key (brand_id, workspace_id) references public.brands (id, workspace_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.model_projects (id, workspace_id) on delete set null (project_id),
  -- Path must start with the workspace folder; storage policies rely on it.
  check (storage_path like workspace_id::text || '/%')
);
create index assets_brand_idx on public.assets (brand_id, created_at desc);
create index assets_project_idx on public.assets (project_id);

create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  workspace_id uuid not null,
  label text,
  snapshot jsonb not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.model_projects (id, workspace_id) on delete cascade
);
create index project_versions_project_idx on public.project_versions (project_id, created_at desc);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  workspace_id uuid not null,
  scene_id uuid references public.scenes (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'rendering', 'succeeded', 'failed', 'canceled')),
  config jsonb not null,
  progress real not null default 0 check (progress between 0 and 1),
  output_path text,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.model_projects (id, workspace_id) on delete cascade
);
create index export_jobs_project_idx on public.export_jobs (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.can_edit_workspace(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'editor')
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.can_edit_workspace(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;

-- Signup: profile + personal workspace + owner membership.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws_id uuid;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into public.workspaces (name, created_by)
  values ('My Workspace', new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at / last_edited_at current.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger brands_touch before update on public.brands
  for each row execute function public.touch_updated_at();
create trigger brand_kits_touch before update on public.brand_kits
  for each row execute function public.touch_updated_at();
create trigger scenes_touch before update on public.scenes
  for each row execute function public.touch_updated_at();
create trigger export_jobs_touch before update on public.export_jobs
  for each row execute function public.touch_updated_at();

-- Runs as the invoking user, so RLS on model_projects still applies. Reads only the row
-- that exists for the operation: NEW for INSERT/UPDATE, OLD for DELETE (and OLD too when
-- an UPDATE moves a scene to another project, so both projects are touched).
create or replace function public.touch_project_from_scene()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.model_projects set last_edited_at = now() where id = old.project_id;
  elsif tg_op = 'UPDATE' then
    update public.model_projects set last_edited_at = now() where id in (new.project_id, old.project_id);
  else
    update public.model_projects set last_edited_at = now() where id = new.project_id;
  end if;
  return null; -- AFTER trigger: return value is ignored
end;
$$;

create trigger scenes_touch_project after insert or update or delete on public.scenes
  for each row execute function public.touch_project_from_scene();

-- ---------------------------------------------------------------------------
-- Atomic multi-row operations (SECURITY INVOKER: RLS applies to every statement)
-- ---------------------------------------------------------------------------

create or replace function public.create_brand(p_workspace_id uuid, p_name text, p_kit jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  b_id uuid;
begin
  insert into public.brands (workspace_id, name, created_by)
  values (p_workspace_id, p_name, (select auth.uid()))
  returning id into b_id;

  insert into public.brand_kits (brand_id, workspace_id, kit)
  values (b_id, p_workspace_id, p_kit);

  return b_id;
end;
$$;

-- p_scenes: [{ "name": text, "kind": text, "document": jsonb }, ...] in display order.
create or replace function public.create_model_project(
  p_workspace_id uuid,
  p_brand_id uuid,
  p_name text,
  p_model_year integer,
  p_model_name text,
  p_export_config jsonb,
  p_scenes jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p_id uuid;
begin
  insert into public.model_projects (workspace_id, brand_id, name, model_year, model_name, export_config, created_by)
  values (p_workspace_id, p_brand_id, p_name, p_model_year, p_model_name, p_export_config, (select auth.uid()))
  returning id into p_id;

  insert into public.scenes (project_id, workspace_id, name, kind, position, document)
  select p_id, p_workspace_id, s.value ->> 'name', s.value ->> 'kind', (s.ordinality - 1)::int, s.value -> 'document'
  from jsonb_array_elements(p_scenes) with ordinality as s(value, ordinality);

  return p_id;
end;
$$;

create or replace function public.duplicate_model_project(p_project_id uuid, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  src public.model_projects%rowtype;
  new_id uuid;
begin
  select * into src from public.model_projects where id = p_project_id;
  if not found then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  insert into public.model_projects
    (workspace_id, brand_id, name, model_year, model_name, status, brand_kit_overrides, export_config, created_by)
  values
    (src.workspace_id, src.brand_id, p_name, src.model_year, src.model_name, 'draft',
     src.brand_kit_overrides, src.export_config, (select auth.uid()))
  returning id into new_id;

  -- Layers reference brand-scoped assets by id, so the copy shares the same photos.
  insert into public.scenes (project_id, workspace_id, name, kind, position, document)
  select new_id, s.workspace_id, s.name, s.kind, s.position, s.document
  from public.scenes s
  where s.project_id = p_project_id;

  return new_id;
end;
$$;

revoke all on function public.create_brand(uuid, text, jsonb) from public, anon;
revoke all on function public.create_model_project(uuid, uuid, text, integer, text, jsonb, jsonb) from public, anon;
revoke all on function public.duplicate_model_project(uuid, text) from public, anon;
grant execute on function public.create_brand(uuid, text, jsonb) to authenticated;
grant execute on function public.create_model_project(uuid, uuid, text, integer, text, jsonb, jsonb) to authenticated;
grant execute on function public.duplicate_model_project(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.brands enable row level security;
alter table public.brand_kits enable row level security;
alter table public.model_projects enable row level security;
alter table public.scenes enable row level security;
alter table public.assets enable row level security;
alter table public.project_versions enable row level security;
alter table public.export_jobs enable row level security;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

create policy "own profile read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members read workspace" on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));
create policy "owners update workspace" on public.workspaces
  for update to authenticated
  using (exists (select 1 from public.workspace_members m
                 where m.workspace_id = workspaces.id and m.user_id = (select auth.uid()) and m.role = 'owner'));

create policy "members read memberships" on public.workspace_members
  for select to authenticated using (public.is_workspace_member(workspace_id));

-- Same read/write shape for every workspace-scoped content table.
do $$
declare
  t text;
begin
  foreach t in array array['brands', 'brand_kits', 'model_projects', 'scenes', 'assets', 'project_versions', 'export_jobs']
  loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))', t);
    execute format('create policy "editors insert" on public.%I for insert to authenticated with check (public.can_edit_workspace(workspace_id))', t);
    execute format('create policy "editors update" on public.%I for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id))', t);
    execute format('create policy "editors delete" on public.%I for delete to authenticated using (public.can_edit_workspace(workspace_id))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assets', 'assets', false, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'font/woff', 'font/woff2', 'font/ttf', 'font/otf']
)
on conflict (id) do nothing;

-- Object paths are `{workspace_id}/...`; the first folder decides access.
create policy "assets read" on storage.objects
  for select to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] in (
    select m.workspace_id::text from public.workspace_members m where m.user_id = (select auth.uid())));

create policy "assets insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assets' and (storage.foldername(name))[1] in (
    select m.workspace_id::text from public.workspace_members m
    where m.user_id = (select auth.uid()) and m.role in ('owner', 'editor')));

create policy "assets delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'assets' and (storage.foldername(name))[1] in (
    select m.workspace_id::text from public.workspace_members m
    where m.user_id = (select auth.uid()) and m.role in ('owner', 'editor')));
