# Everything Ads Studio — Architecture

Status: Milestone 1 (vertical slice) in progress. This document is the engineering
plan; it is updated as milestones land.

## 1. Architecture proposal

```
Browser (Next.js App Router, React 19, TS strict)
 ├─ Server Components  ── read data through the Supabase server client (user JWT, RLS applies)
 ├─ Server Actions     ── all writes; Zod-validated inputs; return Result<T>
 ├─ Client editor      ── Zustand store (scene documents + undo/redo) → React Konva canvas
 └─ Direct uploads     ── browser Supabase client → private Storage bucket (RLS by workspace folder)

Supabase
 ├─ Auth (email + password)
 ├─ Postgres (normalized tables, scene layers as versioned JSONB, RLS on every table)
 └─ Storage bucket `assets` (private; signed URLs only)

Later phases
 ├─ Remotion Player (preview)  ── renders the SAME SceneDocument via shared geometry/motion modules
 └─ Render worker (separate host, @remotion/renderer) ── polls export_jobs, uploads MP4 to Storage
```

Key decisions

- **One shared scene schema** (`src/domain/scene.ts`, Zod) is the contract between
  editor, preview and export. Everything that turns a layer into pixels goes through
  pure functions in `src/domain/geometry.ts` (image fit/crop rectangles, gradient
  points). Konva and Remotion both consume those functions instead of relying on
  their own layout semantics (e.g. CSS `object-fit` vs. Konva crop).
- **Logical coordinates.** Layers are stored in scene pixels (default 1080 wide). The
  editor scales the Konva `Stage`; it never rewrites layer geometry.
- **Optimistic concurrency.** Every scene row has a `revision`. Saves are
  `UPDATE … WHERE id = $1 AND revision = $expected`; zero rows ⇒ conflict, surfaced in
  the UI (reload or keep mine). Failed saves stay dirty and are retried, never dropped.
- **Workspace-scoped RLS.** Every content table carries `workspace_id`; composite foreign
  keys `(parent_id, workspace_id)` guarantee children can't point into another
  workspace. Policies call `is_workspace_member()` / `can_edit_workspace()`.
- **Brand isolation.** Brand kits are 1:1 with brands. Assets carry `brand_id`; the
  editor only lists assets for the project's brand, so a second OEM never sees the
  first OEM's photos or styles.
- **Brand kit inheritance.** New layers copy values from the kit's typography/color
  tokens (and remember the token in `styleRef`). Editing a layer is a local override
  and never touches the global kit. Project-level kit overrides
  (`model_projects.brand_kit_overrides`) are reserved for Milestone 2.

## 2. Database schema

See `supabase/migrations/0001_init.sql` (authoritative). Summary:

| table             | purpose                                 | notes                                                                   |
| ----------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| profiles          | 1:1 with `auth.users`                   | created by signup trigger                                               |
| workspaces        | tenancy root                            | personal workspace created on signup                                    |
| workspace_members | (workspace, user, role)                 | roles: owner, editor, viewer                                            |
| brands            | OEM                                     | `archived_at` soft delete                                               |
| brand_kits        | 1:1 brand, `kit` JSONB (Zod `BrandKit`) | `revision`                                                              |
| model_projects    | vehicle model project                   | status, model_year, `export_config` JSONB, `revision`, `last_edited_at` |
| scenes            | ordered scenes of a project             | `document` JSONB (Zod `SceneDocument`), `revision`                      |
| assets            | uploaded photos/logos/fonts             | `storage_path` under `{workspace}/{brand}/…`                            |
| project_versions  | immutable snapshots                     | written in Milestone 2                                                  |
| export_jobs       | render queue                            | consumed by worker in Phase 4                                           |

Security changes made by the migration (explained here as required):

- RLS **enabled** on every public table; no policies for `anon`.
- `authenticated` gets table privileges; RLS restricts rows to workspace members.
  Viewers can read; owners/editors can write.
- Two `SECURITY DEFINER` functions with empty `search_path`:
  `handle_new_user()` (signup trigger: profile + workspace + owner membership) and the
  membership helpers used inside policies (they must bypass RLS on
  `workspace_members` to avoid recursive policy evaluation).
- Storage: private bucket `assets` (25 MB limit, image/font MIME allowlist). Object
  policies allow access only when the first path segment is a workspace the user
  belongs to.
- The service-role key is never used by the web app.

## 3. Folder & component structure

```
src/
  app/
    (auth)/login/                 sign in / sign up
    auth/confirm/route.ts         email confirmation callback
    (app)/layout.tsx              authenticated shell (top nav)
    (app)/dashboard/              recent projects, search, brand filter
    (app)/brands/                 brand library, create brand
    (app)/brands/[brandId]/       brand projects, create project
    (app)/brands/[brandId]/settings/  brand kit editor
    (app)/projects/[projectId]/   project overview (meta, scenes, duplicate, archive)
    projects/[projectId]/editor/  full-screen editor (own layout)
    (app)/projects/[projectId]/preview|export/  status pages until Phase 3/4
  domain/                         framework-free, unit-tested
    brand-kit.ts  scene.ts  motion.ts  project.ts  export-config.ts
    layout-presets.ts  scene-templates.ts  geometry.ts  color.ts  fonts.ts
  features/
    auth/ brands/ projects/ assets/   server actions + feature components
    editor/
      store/        Zustand store, history, selectors
      components/   EditorShell, TopBar, SceneList, LayerList, AssetLibrary,
                    CanvasStage (Konva), layers/*, inspector/*
      hooks/        useAutosave, useKeyboardShortcuts, useImageElement
  lib/
    supabase/ client.ts server.ts proxy.ts
    result.ts env.ts
  components/ui/                  shadcn primitives
  proxy.ts                        session refresh + auth redirect
supabase/migrations/              SQL migrations
docs/                             this file
```

## 4. Packages

Installed now (Milestone 1): `next`, `react`, `@supabase/supabase-js`, `@supabase/ssr`,
`zustand`, `zod`, `konva`, `react-konva`, `lucide-react`, shadcn/ui (`radix-ui`,
`class-variance-authority`, `cn`, `tw-animate-css`), dev: `vitest`, `prettier`,
`prettier-plugin-tailwindcss`, ESLint (Next config), Tailwind 4.

Deferred until the phase that needs them: `remotion`, `@remotion/player` (Phase 3),
`@remotion/renderer`, `@remotion/bundler`, `jszip`/`archiver` (Phase 4),
`@playwright/test` (after Milestone 1, once a test Supabase project exists).

## 5. Milestones

1. **Vertical slice** — auth, personal workspace, brand + kit, project CRUD, photo upload,
   scene editor (image/text/gradient/shape layers, drag/resize/rotate, inspector,
   undo/redo, layout presets, keyboard shortcuts, zoom/fit), autosave with conflict
   detection, reopen.
2. **Editor completeness** — logo layers, brand font upload (FontFace), project-level
   kit overrides, project_versions snapshots, alignment tools, multi-select, asset
   library management, workspace invites.
3. **Motion** — `MotionConfig` UI, pure `evaluateMotion(layer, frame, fps)` shared by
   Konva preview scrubbing and Remotion; Remotion Player scene + full-experience preview.
4. **Export** — render worker (Remotion renderer) consuming `export_jobs`, MP4 per scene,
   CTA PNG/JPG, ZIP batch, job status UI, Konva-vs-Remotion visual diff tests.
5. **Copy Assistant** — OEM URL retrieval, cited suggestions, shortening, human review gate.

## 6. Technical risks & dependencies

- **Konva ↔ Remotion parity.** Canvas text layout (line breaking, letter spacing,
  baseline) differs from DOM text. Mitigation: shared geometry module, shared font
  loading, and screenshot-diff tests of identical documents in Phase 4. Fallback:
  render text in the Remotion composition with the same canvas text routine.
- **Fonts.** Uploaded brand fonts must be loaded (FontFace) before canvas draw and in
  the render worker; license restrictions may apply per OEM.
- **Rendering infrastructure.** Remotion rendering needs Chromium + ffmpeg; it cannot run
  inside a Vercel function for long renders. Needs a worker host (Fly/Render/ECS or
  Remotion Lambda) and a Remotion company license if the org exceeds the free tier.
- **Signed URL expiry** during long editing sessions — editor refreshes URLs periodically.
- **Large uploads** go browser → Storage directly (bypasses Vercel body limits); image
  dimensions are read client-side.
- **Next.js 16** renamed middleware to `proxy.ts`; route params are async.
- **No local Supabase** in this environment (no Docker/CLI): migrations are plain SQL and
  must be applied to a hosted project; end-to-end tests are blocked until then.
