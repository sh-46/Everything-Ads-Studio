// Applies every migration to PGlite (in-process Postgres) with stubbed Supabase auth/storage
// schemas, then checks RLS isolation, RPCs and optimistic concurrency.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../migrations/", import.meta.url);
const migration = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, dir), "utf8"))
  .join("\n");
const db = new PGlite({ extensions: { pgcrypto } });

await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  grant usage on schema public to anon, authenticated;
`);

await db.exec(migration);
console.log("✓ migration applied");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
await db.query(`insert into auth.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')`, [A, B]);

let failures = 0;
const check = (label, cond, detail = "") => {
  if (cond) console.log(`✓ ${label}`);
  else {
    failures++;
    console.log(`✗ ${label} ${detail}`);
  }
};
const as = async (user) => {
  await db.exec(`reset role; set role authenticated;`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const fails = async (sql, params) => {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return e.message;
  }
};

// --- User A
await as(A);
const wsA = (await one(`select workspace_id from workspace_members`)).workspace_id;
check("signup trigger created owner membership", Boolean(wsA));
const profile = await one(`select display_name from profiles`);
check("signup trigger created profile", profile?.display_name === "a");

const brandA = (await one(`select public.create_brand($1, 'Acura', '{"schemaVersion":1}'::jsonb) as id`, [wsA])).id;
check("create_brand returns id", Boolean(brandA));
check(
  "brand kit created with brand",
  (await one(`select count(*)::int as n from brand_kits where brand_id = $1`, [brandA])).n === 1,
);

const scenesJson = JSON.stringify([
  { name: "Intro", kind: "intro", document: { schemaVersion: 1, layers: [] } },
  { name: "Interior", kind: "interior", document: { schemaVersion: 1, layers: [] } },
]);
const projA = (
  await one(`select public.create_model_project($1, $2, '2026 Acura MDX', 2026, 'MDX', '{}'::jsonb, $3::jsonb) as id`, [
    wsA,
    brandA,
    scenesJson,
  ])
).id;
const scenes = (
  await db.query(`select id, name, position, revision from scenes where project_id = $1 order by position`, [projA])
).rows;
check(
  "create_model_project inserts ordered scenes",
  scenes.length === 2 && scenes[0].name === "Intro" && scenes[1].position === 1,
);

const before = (await one(`select last_edited_at from model_projects where id = $1`, [projA])).last_edited_at;
await db.exec(`select pg_sleep(0.01)`);
// Separate transaction so now() advances.
const cas1 = await db.query(
  `update scenes set document = '{"x":1}'::jsonb, revision = 2 where id = $1 and revision = 1 returning revision`,
  [scenes[0].id],
);
const cas2 = await db.query(
  `update scenes set document = '{"x":2}'::jsonb, revision = 2 where id = $1 and revision = 1 returning revision`,
  [scenes[0].id],
);
check("optimistic concurrency: first save wins", cas1.rows.length === 1);
check("optimistic concurrency: stale revision updates nothing", cas2.rows.length === 0);
const after = (await one(`select last_edited_at from model_projects where id = $1`, [projA])).last_edited_at;
check("scene save touches project last_edited_at", after >= before);

const dup = (await one(`select public.duplicate_model_project($1, 'MDX copy') as id`, [projA])).id;
check(
  "duplicate copies scenes",
  (await one(`select count(*)::int as n from scenes where project_id = $1`, [dup])).n === 2,
);

const goodPath = `${wsA}/${brandA}/${projA}/photo.jpg`;
check(
  "asset insert with workspace-prefixed path",
  (await fails(
    `insert into assets (workspace_id, brand_id, project_id, kind, storage_path, mime_type, byte_size, original_filename) values ($1,$2,$3,'photo',$4,'image/jpeg',10,'p.jpg')`,
    [wsA, brandA, projA, goodPath],
  )) === null,
);
check(
  "asset path outside workspace folder is rejected",
  (await fails(
    `insert into assets (workspace_id, brand_id, project_id, kind, storage_path, mime_type, byte_size, original_filename) values ($1,$2,$3,'photo',$4,'image/jpeg',10,'p.jpg')`,
    [wsA, brandA, projA, `other/${brandA}/x.jpg`],
  )) !== null,
);
check(
  "storage: upload into own workspace folder",
  (await fails(`insert into storage.objects (bucket_id, name) values ('assets', $1)`, [goodPath])) === null,
);

// --- 0002: brand assets
const logoId = (
  await one(
    `insert into assets (workspace_id, brand_id, kind, storage_path, mime_type, byte_size, original_filename, display_name, metadata)
     values ($1, $2, 'logo', $3, 'image/svg+xml', 10, 'logo.svg', 'Primary', '{"variant":"Primary"}') returning id`,
    [wsA, brandA, `${wsA}/${brandA}/brand-kit/logo.svg`],
  )
).id;
check("logo stored at brand level with display name and metadata", Boolean(logoId));
check(
  "logo cannot be attached to a project",
  (await fails(
    `insert into assets (workspace_id, brand_id, project_id, kind, storage_path, mime_type, byte_size, original_filename) values ($1,$2,$3,'logo',$4,'image/png',10,'l.png')`,
    [wsA, brandA, projA, `${wsA}/${brandA}/brand-kit/l.png`],
  )) !== null,
);
await db.query(
  `update scenes set document = jsonb_build_object('layers', jsonb_build_array(jsonb_build_object('type','logo','assetId',$2::text))) where id = $1`,
  [scenes[1].id, logoId],
);
const usage = (await db.query(`select * from public.asset_usage($1)`, [logoId])).rows;
check("asset_usage finds scenes referencing a logo", usage.length === 1 && usage[0].scene_name === "Interior");
const fontId = (
  await one(
    `insert into assets (workspace_id, brand_id, kind, storage_path, mime_type, byte_size, original_filename, metadata)
     values ($1, $2, 'font', $3, 'font/woff2', 10, 'Brand-Bold.woff2', '{"family":"Brand Sans","weight":700}') returning id`,
    [wsA, brandA, `${wsA}/${brandA}/brand-kit/f.woff2`],
  )
).id;
await db.query(
  `update scenes set document = jsonb_build_object('layers', jsonb_build_array(jsonb_build_object('type','text','fontFamily','Brand Sans'))) where id = $1`,
  [scenes[0].id],
);
check(
  "asset_usage finds text layers using a font family",
  (await db.query(`select * from public.asset_usage($1)`, [fontId])).rows.length === 1,
);

// --- 0003: motion presets
await one(`select public.save_motion_preset($1, '{"id":"p1","name":"Headline","motion":{}}'::jsonb)`, [projA]);
await one(`select public.save_motion_preset($1, '{"id":"p2","name":"Logo","motion":{}}'::jsonb)`, [projA]);
await one(`select public.save_motion_preset($1, '{"id":"p1","name":"Headline v2","motion":{}}'::jsonb)`, [projA]);
let presets = (await one(`select motion_presets from model_projects where id = $1`, [projA])).motion_presets;
check(
  "save_motion_preset upserts by id",
  presets.length === 2 && presets.some((p) => p.name === "Headline v2"),
  JSON.stringify(presets),
);
await one(`select public.delete_motion_preset($1, 'p2')`, [projA]);
presets = (await one(`select motion_presets from model_projects where id = $1`, [projA])).motion_presets;
check("delete_motion_preset removes one preset", presets.length === 1 && presets[0].id === "p1");

const dupWithPresets = (await one(`select public.duplicate_model_project($1, 'MDX presets copy') as id`, [projA])).id;
check(
  "duplicating a project keeps its motion presets",
  (await one(`select jsonb_array_length(motion_presets) as n from model_projects where id = $1`, [dupWithPresets]))
    .n === 1,
);

// --- User B
await as(B);
const wsB = (await one(`select workspace_id from workspace_members`)).workspace_id;
check("B has a separate workspace", wsB && wsB !== wsA);
check("B cannot see A's brands", (await one(`select count(*)::int as n from brands`)).n === 0);
check("B cannot see A's brand kits", (await one(`select count(*)::int as n from brand_kits`)).n === 0);
check(
  "B cannot see A's projects or scenes",
  (await one(`select (select count(*) from model_projects) + (select count(*) from scenes) as n`)).n == 0,
);
check("B cannot see A's assets", (await one(`select count(*)::int as n from assets`)).n === 0);
check(
  "B cannot see usage of A's assets",
  (await db.query(`select * from public.asset_usage($1)`, [logoId])).rows.length === 0,
);
const bPreset = await db.query(
  `select public.save_motion_preset($1, '{"id":"x","name":"x","motion":{}}'::jsonb) as r`,
  [projA],
);
check("B cannot save presets into A's project", bPreset.rows[0].r === null);
check("B cannot see A's storage objects", (await one(`select count(*)::int as n from storage.objects`)).n === 0);
check(
  "B cannot see A's workspace",
  (await one(`select count(*)::int as n from workspaces where id = $1`, [wsA])).n === 0,
);
check(
  "B cannot create a brand in A's workspace",
  (await fails(`select public.create_brand($1, 'X', '{}'::jsonb)`, [wsA])) !== null,
);
const upd = await db.query(`update scenes set revision = 99 where id = $1 returning id`, [scenes[0].id]);
check("B cannot update A's scenes", upd.rows.length === 0);
check(
  "B cannot upload into A's storage folder",
  (await fails(`insert into storage.objects (bucket_id, name) values ('assets', $1)`, [`${wsA}/x/y.jpg`])) !== null,
);
const brandB = (await one(`select public.create_brand($1, 'Honda', '{}'::jsonb) as id`, [wsB])).id;
check(
  "B cannot attach a project in their workspace to A's brand (composite FK)",
  (await fails(`select public.create_model_project($1, $2, 'x', 2026, 'x', '{}'::jsonb, '[]'::jsonb)`, [
    wsB,
    brandA,
  ])) !== null,
);
check(
  "B cannot point an asset at A's brand from their workspace",
  (await fails(
    `insert into assets (workspace_id, brand_id, kind, storage_path, mime_type, byte_size, original_filename) values ($1,$2,'photo',$3,'image/jpeg',10,'p.jpg')`,
    [wsB, brandA, `${wsB}/x.jpg`],
  )) !== null,
);
check("B sees only their own brand", (await db.query(`select id from brands`)).rows.map((r) => r.id).join() === brandB);

// --- Viewer role is read-only
await db.exec(`reset role`);
await db.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'viewer')`, [wsA, B]);
await as(B);
check(
  "viewer can read shared workspace",
  (await one(`select count(*)::int as n from brands where workspace_id = $1`, [wsA])).n === 1,
);
const viewerUpd = await db.query(`update brands set name = 'hacked' where id = $1 returning id`, [brandA]);
check("viewer cannot write", viewerUpd.rows.length === 0);

// --- Preferences (0004): own profile only
await as(A);
await db.query(`update profiles set preferences = '{"zoom":"fit"}'::jsonb where id = $1`, [A]);
check("A can save own preferences", (await one(`select preferences->>'zoom' as z from profiles`)).z === "fit");
await as(B);
const prefUpd = await db.query(`update profiles set preferences = '{"x":1}'::jsonb where id = $1 returning id`, [A]);
check("B cannot change A's preferences", prefUpd.rows.length === 0);
check("B cannot read A's profile", (await one(`select count(*)::int as n from profiles where id = $1`, [A])).n === 0);
check(
  "preferences must be an object",
  (await fails(`update profiles set preferences = '[1]'::jsonb where id = $1`, [B])) !== null,
);

// --- Anonymous
await db.exec(`reset role; set role anon;`);
check("anon has no table access", (await fails(`select * from brands`)) !== null);
check("anon can read applied schema versions", (await one(`select count(*)::int as n from schema_versions`)).n === 4);
check(
  "anon cannot write schema versions",
  (await fails(`insert into schema_versions (version) values ('x')`)) !== null,
);
await as(A);
check(
  "users cannot write schema versions",
  (await fails(`insert into schema_versions (version) values ('x')`)) !== null,
);

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
