-- Project-level motion presets (reusable motion settings).
-- Security: no policy changes. The column inherits model_projects RLS; both functions are
-- SECURITY INVOKER, so callers can only change projects they may already update.

alter table public.model_projects
  add column motion_presets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(motion_presets) = 'array' and jsonb_array_length(motion_presets) <= 100);

-- Insert or replace a preset (matched by its "id") atomically.
create or replace function public.save_motion_preset(p_project_id uuid, p_preset jsonb)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  update public.model_projects
     set motion_presets = coalesce(
           (select jsonb_agg(e) from jsonb_array_elements(motion_presets) e where e ->> 'id' <> p_preset ->> 'id'),
           '[]'::jsonb
         ) || jsonb_build_array(p_preset)
   where id = p_project_id
  returning motion_presets;
$$;

create or replace function public.delete_motion_preset(p_project_id uuid, p_preset_id text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  update public.model_projects
     set motion_presets = coalesce(
           (select jsonb_agg(e) from jsonb_array_elements(motion_presets) e where e ->> 'id' <> p_preset_id),
           '[]'::jsonb
         )
   where id = p_project_id
  returning motion_presets;
$$;

revoke all on function public.save_motion_preset(uuid, jsonb) from public, anon;
revoke all on function public.delete_motion_preset(uuid, text) from public, anon;
grant execute on function public.save_motion_preset(uuid, jsonb) to authenticated;
grant execute on function public.delete_motion_preset(uuid, text) to authenticated;

-- Duplicating a project also copies its motion presets (otherwise unchanged from 0001).
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
    (workspace_id, brand_id, name, model_year, model_name, status, brand_kit_overrides, export_config,
     motion_presets, created_by)
  values
    (src.workspace_id, src.brand_id, p_name, src.model_year, src.model_name, 'draft',
     src.brand_kit_overrides, src.export_config, src.motion_presets, (select auth.uid()))
  returning id into new_id;

  insert into public.scenes (project_id, workspace_id, name, kind, position, document)
  select new_id, s.workspace_id, s.name, s.kind, s.position, s.document
  from public.scenes s
  where s.project_id = p_project_id;

  return new_id;
end;
$$;
