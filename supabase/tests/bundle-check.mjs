// Checks supabase/setup/apply-all.sql on a fresh PGlite: applies cleanly once, and a
// second run is refused by the guard without changing anything.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../setup/apply-all.sql", import.meta.url), "utf8");
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public to anon, authenticated;
`);
let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label} ${ok ? "" : detail}`);
  if (!ok) failures++;
};
// An account that signed up before the schema existed (no trigger yet).
await db.query(`insert into auth.users (id, email) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'early@x.com')`);
await db.exec(sql);
const early = (
  await db.query(
    `select count(*)::int as n from public.workspace_members where user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' and role = 'owner'`,
  )
).rows[0].n;
check("pre-existing accounts get a personal workspace", early === 1);
const versions = (await db.query(`select version from public.schema_versions order by version`)).rows.map(
  (r) => r.version,
);
check("bundle applies on a fresh database", versions.length === 4, versions.join());
check(
  "private assets bucket created",
  (await db.query(`select public from storage.buckets where id = 'assets'`)).rows[0]?.public === false,
);
await db.query(`insert into auth.users (id, email) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@x.com')`);
const before = (await db.query(`select count(*)::int as n from public.workspaces`)).rows[0].n;
let error = null;
try {
  await db.exec(sql);
} catch (e) {
  error = e.message;
}
check("second run is refused by the guard", /already exists/.test(error ?? ""), String(error));
await db.exec("rollback").catch(() => {});
check(
  "second run changed nothing",
  (await db.query(`select count(*)::int as n from public.workspaces`)).rows[0].n === before,
);
console.log(failures ? `\n${failures} check(s) failed` : "\nBundle checks passed");
process.exit(failures ? 1 : 0);
