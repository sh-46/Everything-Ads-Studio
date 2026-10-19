-- Brand Kit logos/fonts and the project photo library.
-- Security: no policy changes. Existing workspace RLS on `assets` and storage already
-- covers the new rows; `asset_usage` is SECURITY INVOKER so it only sees what the
-- caller can see.

alter table public.assets
  add column display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  add column metadata jsonb not null default '{}'::jsonb;

-- Logos and fonts belong to a brand, never a project (stored under {brand}/brand-kit/).
-- Photos are registered with a project; deleting the project nulls project_id, so it
-- is not enforced for photos here.
alter table public.assets
  add constraint assets_scope_check check (kind = 'photo' or (project_id is null and brand_id is not null));

create index assets_brand_kind_idx on public.assets (brand_id, kind, created_at desc);

-- Where an asset is used: layers referencing it by id, or (fonts) text layers using its family.
create or replace function public.asset_usage(p_asset_id uuid)
returns table (project_id uuid, project_name text, scene_id uuid, scene_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.name, s.id, s.name
  from public.assets a
  join public.model_projects p on p.brand_id = a.brand_id
  join public.scenes s on s.project_id = p.id
  where a.id = p_asset_id
    and exists (
      select 1
      from jsonb_array_elements(s.document -> 'layers') l
      where l ->> 'assetId' = a.id::text
         or (a.kind = 'font' and l ->> 'type' = 'text' and l ->> 'fontFamily' = a.metadata ->> 'family')
    )
  order by p.name, s.position;
$$;

revoke all on function public.asset_usage(uuid) from public, anon;
grant execute on function public.asset_usage(uuid) to authenticated;
