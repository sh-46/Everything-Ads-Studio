# Everything Ads Studio — Architecture

Status: Milestone 1, Phase 2.5 (photo workflow, brand fonts/logos) and Phase 3 (motion
engine, Remotion preview) and Phase 4 (local production export, Facebook Experience Preview) are
implemented, plus the Phase 4 final addendum (photo disclosures, Static / No Motion, visibility timing,
per-scene durations, export benchmarking). Supabase integration testing / Phase 5 are next.

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

`0002_brand_assets.sql` adds `assets.display_name`, `assets.metadata` (logo variant; font family,
weight, style), a check that logos/fonts are brand-level, and the `asset_usage(asset_id)` function
(SECURITY INVOKER) used to warn before deleting files that scenes still use. No policy changes.

`0003_motion_presets.sql` adds `model_projects.motion_presets` (JSONB array, ≤ 100), the
`save_motion_preset` / `delete_motion_preset` functions (SECURITY INVOKER, atomic upsert/delete by preset
id) and updates `duplicate_model_project` to copy presets. No policy changes.

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

Installed: `next`, `react`, `@supabase/supabase-js`, `@supabase/ssr`, `zustand`, `zod`, `konva`,
`react-konva`, `lucide-react`, shadcn/ui (`radix-ui`, `class-variance-authority`, `cn`,
`tw-animate-css`), `remotion` + `@remotion/player` (pinned to the same exact version, as Remotion
requires); dev: `vitest`, `prettier`, `prettier-plugin-tailwindcss`, `@electric-sql/pglite` (SQL/RLS
tests), ESLint, Tailwind 4.

Phase 4: `@remotion/renderer`, `@remotion/bundler` (same exact Remotion version), `fflate` (streaming ZIP).
Deferred: `@playwright/test`
(once a test Supabase project exists; browser checks currently run as ad-hoc scripts).

**Remotion licence:** Remotion is free for individuals and companies of up to 3 people; larger
companies need a company licence. Treated as a personal, independently developed project for now; the owner
verifies the terms before any commercial use or deployment. No licence key is set and nothing is
acknowledged on the owner's behalf.

## 5. Milestones

1. **Vertical slice** — done.
2. **Phase 2.5 — photo workflow & Brand Kit assets** — done: project photo library with batch upload,
   Add Image (upload / library / empty frame), canvas drop, replace/remove keeping layout and motion,
   Scenes Overview photo slots, scene duplication, brand fonts (FontFace) and logo library, safe delete
   with usage check (`asset_usage`).
3. **Phase 3 — motion** — done: `MotionConfig` (entrance, continuous, exit, two-image transition,
   sequencing, hold), pure `motion-engine.ts`, Motion inspector, Remotion Player scene preview and
   full-experience mobile preview (Outro + CTA stacked).
4. **Phase 4 — export** — done (local): see "Export pipeline" below.
5. **Copy Assistant** — OEM URL retrieval, cited suggestions, shortening, human review gate.
6. Not yet scheduled: multi-select, snapping, project-level kit overrides, `project_versions`
   snapshots, workspace invites, periodic signed-URL refresh.

### Motion engine

- Stored per layer in `layer.motion` (Zod `motionConfigSchema`, every field defaulted so older
  documents parse). No separate animation format.
- `computeSceneTimings(layers, durationMs)` resolves start/entrance/exit/continuous windows.
  "Previous" = the nearest visible layer below. Hold 0 = exit finishes at scene end.
- `evaluateMotion(layer, timing, tMs)` → opacity, layer translate/scale, and image content
  translate/scale (Ken Burns, transitions). Pure and frame-deterministic (`frameToMs`).
- The Konva canvas shows the static, fully-entered layout; animation is rendered only by Remotion
  (`features/preview`), which is what the Phase 4 renderer will reuse.
- Brand Kit `motionDefaults` are copied onto layers at creation; later kit edits don't touch them.
- Entrance = `fade` (bool) + `move` (none / slide ×4 / scaleIn), so any combination is expressible. The
  earlier single `preset` (whose slides and scale also faded) migrates on parse to the identical combination.
- Easing: Linear, Ease In / Ease Out / Ease In Out (cubic), Spring (damped, ζ 0.65, ~7% overshoot; opacity
  is clamped, movement may overshoot). Legacy `easeOutCubic` / `easeInOutCubic` map to the identical curves.
- Camera motion (`continuous`) has its own easing; `cameraCoverage()` samples it to detect blank edges.
- Motion focus point: `ImageLayer.motionFocus` ({x, y} in 0–1 of the original image, or null). The engine maps
  it through the static framing (`fitImageRect`: fit, static zoom, static pan) to frame pixels and uses it as
  the content scale origin (`MotionState.contentOrigin`); zoom keeps that point fixed on screen. Pans scale
  about it by the minimum that keeps the frame covered. null = frame-center origin with the original pan math,
  so older projects render identically. The Konva crosshair overlay exists only in the editor.
- Photo 1 → Photo 2: `photoPair()` finds a photo stacked over the main photo in (nearly) the same frame; the
  transition is stored on Photo 2 (`motion.transition` + its start time).
- Motion presets (`motion-presets.ts`) copy timing, entrance, camera motion and exit onto a layer — never the
  transition — and are never live-linked.

### Render consistency (Konva ↔ Remotion)

Pinned by `features/preview/layer-style.test.ts`: image placement (`fitImageRect` vs
`visibleImageRegion`), CSS gradient angle semantics vs Konva gradient points, identical font stack
(`fontStack`) and type metrics, rotation about the top-left, corner-radius clamping. Text line
breaking can still differ slightly between canvas and DOM; Phase 4 adds pixel-diff checks.

### Assets & fonts

- Photos are project-scoped (`{ws}/{brand}/{project}/…`); logos and fonts are brand-scoped
  (`{ws}/{brand}/brand-kit/…`). Layers reference asset ids; replacing a file keeps the id.
- Uploads are validated in the browser (type, size, magic bytes, SVG safety) and again on the server
  (Demo route; production re-checks SVG/fonts after upload).
- Fonts load via `FontFace` (`use-brand-fonts.ts`); the canvas re-measures text once loaded. Family
  metadata is read from the font's `name`/`OS/2` tables (TTF/OTF/WOFF) or the file name (WOFF2).

### Export pipeline

```
Export page / editor menu ──POST /api/exports {projectId, sceneId?}──▶ jobs.ts (in-memory queue, 1 at a time)
   ▲  poll GET /api/exports/:id (status, stage, per-item progress)        │
   │                                                                     ├─ inputs.ts: validate scene, resolve asset/font URLs, cache key
   └── GET /api/exports/:id/download[?item=key] (owner-checked)          ├─ renderer.ts: bundle src/remotion once per code version,
                                                                         │    renderMedia (MP4) / renderStill (CTA PNG), verify output
                                                                         └─ zip.ts: stream files into the ZIP (stored), verify CRCs
```

- `src/remotion/` registers one `Scene` composition whose size/duration come from the document. It renders
  `SceneLayers` — the component the Remotion Player preview uses — inside `RenderModeContext="render"`
  (no empty-frame outlines; a missing image fails the render instead of showing a placeholder).
- Brand fonts are loaded with `FontFace` under `delayRender`; a failed font cancels the render.
- `src/domain/export-plan.ts` decides the package contents and file names (sanitized, unique);
  `src/domain/export-settings.ts` holds the MP4 settings (H.264 High, level by size, yuv420p, CFR 30, 5 Mbps
  target with 6 Mbps VBV cap).
- Cache key: sha256 of render version + settings + document + used assets (stable URL, size, disclosure
  wording) + fonts.
- One Chrome per job (`openBrowser`, passed as `puppeteerInstance` to `selectComposition`/`renderMedia`/
  `renderStill`), released at the end or after a failure. Tunables read per render: `EXPORT_CONCURRENCY`,
  `EXPORT_GL`, `EXPORT_REUSE_BROWSER` (see _Export performance_).
- Progress is weighted by frames (PNG ≈ 6 frames); the ETA divides remaining work by this job's measured
  throughput (rendered work only — reused files would skew it). Each item records `renderMs`, frames and fps;
  every render is logged as `[export] …` on the server.

### Export performance

Benchmarked with `EXPORT_GL` / `EXPORT_CONCURRENCY` / `EXPORT_REUSE_BROWSER` on an M2 Pro (table in the README).
Software GL (`swangle`) capped rendering at ~3.8 fps regardless of tabs; Chrome's GPU backend (`angle`, Metal)
reaches ~15.5 fps with a single tab (more tabs contend for the GPU). Default: `angle` × 1 with an automatic
per-file retry on `swangle`. Full package: 1,710 frames in ~106 s (previously ≈ 7.5 min for the same work).

### Disclosures, visibility and static motion

```
asset.metadata { requiresDisclosure, disclosureText }      ← single source of truth (per photo)
text layer.disclosure { assetId, imageLayerId }           ← link; text resolved at render time
layer.visibility { mode: always | range | linkedPhoto }    ← when (visibility.ts), independent of…
layer.motion.static                                         ← …how (motion-engine.ts: identity motion)
```

- `src/domain/disclosures.ts` — create/ensure (no duplicates, safe area, clear of copy), photo-change plans
  (relink / add / remove / keep as text, with the question to ask), library sync, quality checks and quick
  fixes. Used by the editor store, the Scenes Overview server actions, the export page and the job runner.
- `src/domain/visibility.ts` — visibility windows. `linkedPhoto` follows the photo frame: from its start (or
  the middle of its incoming transition) to its exit, or to the middle of Photo 2's transition for Photo 1.
  `hiddenInStaticLayout` keeps only Photo 2's disclosure in the static layout (CTA PNG, editor default).
- `src/domain/text-layout.ts` — word wrapping for the checks: canvas measurement in the browser, a slightly
  generous estimate on the server.
- `SceneLayers` (preview + export) skips layers outside their window and renders `resolveLayerText`; the
  Konva editor resolves the same text and marks disclosures (amber outline, safe-area guide when selected).
- Reliability: same request while active → same job; watchdog cancels a render with no progress for 90 s;
  temp files are renamed into place only after verification; old jobs/cache are cleaned on each run.
- Replaceable later by a worker host consuming `export_jobs` behind the same API routes.

## 6. Technical risks & dependencies

- **Konva ↔ Remotion parity.** Canvas text layout (line breaking, letter spacing,
  baseline) differs from DOM text. Mitigation: shared geometry module, shared font
  loading, and screenshot-diff tests of identical documents in Phase 4. Fallback:
  render text in the Remotion composition with the same canvas text routine.
- **Fonts.** Brand fonts load via FontFace in the editor and preview; the Phase 4 worker must load
  the same files before rendering. OEM font licences may restrict web embedding.
- **Rendering infrastructure.** Rendering runs locally inside the Next server (Chrome + Remotion's ffmpeg).
  It cannot run inside a Vercel function for long renders; a deployed version needs a worker host
  (no paid cloud rendering service has been introduced). Remotion needs a company licence if the
  organization exceeds the free tier — flagged for the owner's review.
- **Signed URL expiry** — signed URLs last 6 h; automatic refresh is not implemented yet, so a
  very long editing session needs a page reload.
- **Large uploads** go browser → Storage directly (bypasses Vercel body limits); image
  dimensions are read client-side.
- **Next.js 16** renamed middleware to `proxy.ts`; route params are async.
- **No local Supabase** in this environment (no Docker/CLI): migrations are plain SQL and
  must be applied to a hosted project; end-to-end tests are blocked until then.
