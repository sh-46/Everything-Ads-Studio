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

// --- Anonymous
await db.exec(`reset role; set role anon;`);
check("anon has no table access", (await fails(`select * from brands`)) !== null);

console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
