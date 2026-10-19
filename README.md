# Everything Ads Studio

A browser-based production tool for building multi-scene automotive motion ads from static vehicle photography.
Brands (OEMs) have Brand Kits; model projects have scenes; scenes are stacks of editable layers.

Architecture, schema, roadmap and risks: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

Milestone 1 (vertical slice) plus **Phase 2.5 (photo workflow, Brand Kit fonts & logos)** and
**Phase 3 (motion engine & preview)** and **Phase 4 (local production export & Facebook Experience Preview)**.

| Area                                                                                                                                                                                            | State                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Auth, workspace, dashboard, brands, Brand Kit, project CRUD                                                                                                                                     | Built                                                |
| Scene editor: text / image / gradient / shape / logo layers, drag, resize, rotate, inspector, undo/redo, shortcuts, layout presets                                                              | Built                                                |
| Autosave with Saving / Saved / Error, retry, revision conflict resolution                                                                                                                       | Built                                                |
| Photo workflow: batch upload, project photo library, Add Image (upload / library / empty frame), canvas drag-and-drop, Replace / Remove keeping layout & motion, safe delete with usage warning | Built                                                |
| Scenes Overview: photo slots per scene (1–2 photos; CTA optional), assign / replace / remove before opening the editor                                                                          | Built                                                |
| Brand Kit fonts (TTF/OTF/WOFF/WOFF2, FontFace loading, metadata detection + correction) and Logo Library (SVG/PNG/WebP, variants)                                                               | Built                                                |
| Motion: entrance, continuous image motion, exit, two-image transitions, sequencing, timing — Motion inspector                                                                                   | Built                                                |
| Scene Preview (Remotion Player: play, pause, restart, scrub) and Facebook mobile preview (feed → Learn More → Build, Outro + CTA)                                                               | Built                                                |
| Scene duplication                                                                                                                                                                               | Built                                                |
| Multi-select, snapping, workspace invites                                                                                                                                                       | Not started                                          |
| Export: Creative Package ZIP (Motion Tile + Facebook Build), single-scene MP4/PNG, job progress, retry, render cache                                                                            | Built (local renderer)                               |
| Photo disclosures (per-photo wording, static disclosure layers, two-photo hand-over, quality checks, pre-export review); visibility timing; Static / No Motion; per-scene durations             | Built                                                |
| Supabase persistence (Phase 5): auth, RLS, private Storage with authorized `/api/assets` links, autosave hardening, editor preferences, setup bundle                                            | Built — verified end-to-end against the live project |
| Copy Assistant                                                                                                                                                                                  | Phase 5                                              |

## Setup (Supabase — persistent mode)

Requirements: Node 20.9+ and a Supabase project.

1. `npm install`
2. **Database (once per Supabase project).** Dashboard → SQL Editor → paste the whole of
   `supabase/setup/apply-all.sql` → Run. It applies migrations 0001–0004 in one transaction: tables, RLS
   policies, RPCs, the private `assets` Storage bucket and its policies. It is additive and refuses to run if
   the schema already exists. Check with `select * from public.schema_versions;` (four rows).
   For an existing database, run only the missing files from `supabase/migrations/` in order.
   (`npm run db:bundle` regenerates the file after adding a migration; `npm run test:db` checks both.)
3. `.env.local` (gitignored) with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   (Project Settings → API). Only the publishable key is used; never add the service-role key.
4. Auth: Dashboard → Authentication → URL Configuration → Site URL `http://localhost:3001` (and add it to
   Redirect URLs) so confirmation links open this app. For quick local testing you can turn off
   Authentication → Sign In / Providers → Email → "Confirm email".
5. `npm run dev -- -p 3001` → http://localhost:3001 → sign up / sign in.

### What is stored where

| Data                                                                                                                                                                               | Where                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brands, Brand Kits (colours, typography, motion defaults)                                                                                                                          | `brands`, `brand_kits.kit` (JSONB)                                                                                                                                                          |
| Projects, motion presets                                                                                                                                                           | `model_projects` (`motion_presets` JSONB)                                                                                                                                                   |
| Scenes: size, duration, layers + order, text & styling, photo assignments, motion (timing, easing, Static), focus points, camera, transitions, visibility timing, disclosure links | `scenes.document` (JSONB, validated by `src/domain/scene.ts`) with a `revision` for safe concurrent saves                                                                                   |
| Photos, logos, fonts                                                                                                                                                               | Storage bucket `assets` (private) + `assets` rows: original filename, size, dimensions, font/logo metadata, **photo disclosure** (`metadata.requiresDisclosure`, `metadata.disclosureText`) |
| Editor preferences (zoom, last scene per project)                                                                                                                                  | `profiles.preferences`                                                                                                                                                                      |

### Security model

- Every table has RLS. Rows belong to a workspace; signing up creates a personal workspace with you as owner,
  so your brands, projects, scenes and files are visible only to you. All functions run as the caller
  (SECURITY INVOKER) except two membership helpers.
- Storage: files live at `{workspace}/{brand}/{project | brand-kit}/{uuid}.{ext}` (no name collisions; the
  original filename is kept in the database). Storage policies allow read/upload/delete only inside your
  workspace folder. The browser uploads directly with your session; the server re-checks the path and file
  contents before registering it.
- The app never hands out long-lived links: images and fonts load from `/api/assets/{id}`, which checks your
  session and RLS and redirects to a 10-minute signed URL. Exports get signed URLs on the server for the
  render browser. Signed-out API calls get `401`; signed-out pages redirect to `/login`.

### Saving

Edits autosave about 0.8 s after you stop (every scene, every change). The top bar shows Saving / Saved /
Unsaved / Error and only says Saved after the database confirms. Each save is compare-and-swap on the scene's
`revision`, so a stale tab can't overwrite newer work — you choose which version to keep. Failed saves keep
your edits, retry with backoff (2 s → 30 s), retry immediately when the network returns, and flush when the
tab is hidden. If your session expires, saving reports it instead of navigating away; sign in again in
another tab and it resumes. Undo/redo stays available for the session.

## Local Demo Mode (no Supabase)

```bash
npm run dev:demo        # http://localhost:3000 (add `-- -p 3001` for another port)
```

Explore the Dashboard, Brand Library, Brand Kits, Model Projects and the Scene Editor without signing in.
Sample data: **Acura (Sample)** with **2026 Acura MDX — Sample** (photos and copy on every scene) and
**Honda (Sample)** with a separate Brand Kit, to show brand isolation.

- On only when `NODE_ENV=development` **and** `DEMO_MODE=1`. `next build` / `next start` force production,
  so it cannot activate in a deployed app (covered by `src/lib/demo/mode.test.ts`).
- No Supabase client is created; data lives in dev-server memory and resets when the server restarts.
- Sample "photos" are generated illustrations labeled SAMPLE PHOTO, and copy is labeled as sample copy.
- Photos you upload in Demo Mode stay in dev-server memory (`/api/demo/assets`, 404 outside Demo Mode).
- Every page shows an amber **Demo Mode · sample data** badge.
- To remove it later, delete `src/lib/demo/`, `src/app/api/demo/` and the `isDemoMode()` guards.

## Testing the photo and motion workflows (Demo Mode)

Start with `npm run dev:demo -- -p 3001` and open
http://localhost:3001/projects/d0000000-0000-4000-8000-0000000001a1.

**Photos**

1. _Project photos_ → **Upload photos** (select several, or drag them in).
2. On a scene card, **Upload / choose…** or **Replace…** assigns a photo to Photo 1 or Photo 2. Replace keeps the
   frame's position, crop and motion. **Remove** unassigns; the file stays in the library.
3. **Open editor** on a card opens that scene with the photos in place.
4. In the editor, the image button offers **Upload from computer…**, **Choose from project photos…** and
   **Empty frame**; you can also drop files onto the canvas. With an image layer selected, use **Replace photo…**
   in the inspector or click a photo in **Assets → Photos**.
5. Deleting a file (trash icon / Delete file…) is permanent and first shows where it is used.

**Motion**

1. Select a layer → **Motion** in the inspector:
   - **Starts** (scene start / with / after previous layer) and **Delay**.
   - **Entrance**: tick **Fade in** and/or pick a **Movement** (Slide Up/Down/Left/Right, Scale In) — e.g.
     Fade In + Slide Up, or Slide Up only. Duration and **Ease** (Linear, Ease In, Ease Out, Ease In Out (Easy
     Ease), Spring) with a curve preview.
   - **Camera motion** (photos/logos): animated zoom or pan with its own duration and easing, separate from the
     static **Image framing** above. A warning (with **Fix**) appears if the motion would show blank edges.
   - **Motion focus point** (under Camera motion): **Edit focus point** shows a crosshair on the photo — click or
     drag it onto the vehicle, then **Done** (Esc). Zoom heads toward that point and pans scale around it; Focus
     X/Y set it precisely; **Reset to center** restores the default. The point is stored on the photo itself, so
     it follows the car when you crop, resize or change layout.
   - **Photo transition** (on either photo of a Photo 1 → Photo 2 pair): Cut, Crossfade, Slide, Zoom; start
     time, duration, easing, direction. With one photo, **Add second photo…** sets up the pair.
   - **Exit** and **Hold**; **Timing overview** shows when each phase runs and warns if it overruns the scene.
   - ↺ on each section resets it to the default (Brand Kit defaults for text/logos).
2. **Replay** (Motion header) opens the preview at that layer's start. While previewing, editing a motion value
   replays the layer automatically. **Preview motion** (bottom bar) plays the whole scene: play, pause, restart,
   scrub.
3. **Presets** (Motion header): starter presets (Headline — Fade In + Slide Up, Subtitle — Delayed Fade In,
   Vehicle Photo — Slow Zoom In, Logo — Fade In), **Save current motion as preset…** (shared across the
   project's scenes) and **Apply this motion to all headlines/subtitles/…** in the project.
4. **Preview** in the top bar opens the Full experience (phone mockup — scroll or jump between scenes; the scene
   in view plays, Outro + CTA shown together) and a per-scene preview.

**Brand fonts and logos** — Brands → Acura (Sample) → Brand Kit → _Brand fonts_ / _Logo library_. Upload, correct
family/weight/style if needed, then pick the font in Typography or in the editor's Font menu. Place logos with
the ✦ (Add logo) button in the editor.

## Exporting (Phase 4)

Project → **Export** ("Ready to Export"), or the editor's **Export** menu for the current scene. The preview is
optional; you can export without opening it.

**Export Creative Package** produces `{Brand}_{Model}_EverythingAds.zip`:

```
Motion_Tile/{Brand}_{Model}_Motion_Tile_1080x1080.mp4
Facebook_Build/01_Intro_1080x1920.mp4
Facebook_Build/02_Exterior_1080x1920.mp4
Facebook_Build/03_Interior_1080x1920.mp4
Facebook_Build/04_Performance_1080x1920.mp4
Facebook_Build/05_Outro_1080x1620.mp4
Facebook_Build/06_CTA_1080x300.png
```

- **MP4 settings (all MP4s, package and single):** H.264 High profile (level chosen from the frame size, 4.0 for
  1080×1920), yuv420p, constant 30 fps, target 5 Mbps average (VBV max 6 Mbps), resolution and duration match
  the scene, `moov` at the start (faststart). Defined once in `src/domain/export-settings.ts`. The measured
  bitrate of each file is shown next to the target; simple scenes can encode below 5 Mbps.
- **CTA still-frame policy:** the CTA PNG is the static, fully-entered layout (what the Scene Editor shows),
  rendered by the same composition with animation ignored.
- **How it renders:** the Next server bundles `src/remotion` (the same `SceneLayers` + motion engine the
  preview uses) and renders it with `@remotion/renderer` in a local Chrome + ffmpeg. One job at a time;
  identical scenes are reused from a cache; files live in the OS temp folder (`everything-ads-exports`) and
  expire after 6 h (cache 24 h). Jobs are in memory — a server restart drops them. Each file is checked after
  rendering (codec, size, fps, duration / PNG size) and a hung browser fails the job instead of hanging it.
- **Browser:** uses `/Applications/Google Chrome.app` when present (Remotion's downloaded headless shell did not
  start on this macOS). Override with `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome`, or `headless-shell` to
  use Remotion's own.
- **Performance:** see _Export performance_ below. Progress is weighted by frames (a 10 s scene counts more than
  a PNG), each file shows its render time and fps, and the package shows a time-remaining estimate measured from
  the current job.
- **ZIP integrity:** files are written to the ZIP strictly in order and every entry is re-read and compared
  (size + CRC-32) with its rendered file before "Ready to download". (Fixes a Phase 4 bug where concurrent
  writes could corrupt large entries.)
- No database migration: the existing `export_jobs` table is unused for now (jobs are local and in memory).
- Works in Demo Mode (no Supabase).

**Facebook mobile preview** (Project → Preview): a phone with a feed and a sponsored dealership post playing the
Motion Tile. **Learn More** opens the Facebook Build in the phone (Intro → Exterior → Interior → Performance →
Outro + CTA stacked); scroll through it, then **Back** returns to the same place in the feed. It's an internal
simulation and is never part of an export.

**Remotion licence.** Remotion (player, bundler, renderer) is source-available, not open source: free for
individuals and companies of up to 3 employees, a paid company licence above that. This is treated as a
personal, independently developed project for now; the owner will verify the applicable terms before any
commercial use or deployment. No licence key is set (`licenseKey: null`) and nothing is acknowledged on the
owner's behalf.

## Photo disclosures

A disclosure belongs to a **photo**, not a scene: set it when importing photos (every upload asks "Requires
disclosure?" and, if so, for the exact wording) or later from the photo library (Scenes Overview tiles or the
editor's Assets tab → _Photo disclosure…_). The app never suggests or writes wording.

- **Disclosure layers.** Placing a photo that requires a disclosure adds one disclosure layer for that frame
  (never a duplicate): static (no motion), brand body typeface, bottom of the safe area and clear of other
  copy. It's marked in amber on the canvas and in the Layers list. Its text always comes from the photo, so
  editing the wording in the library updates every scene (boxes grow if the new wording needs more room).
  Style, size and position are per scene.
- **Two photos.** In a Photo 1 → Photo 2 transition each photo keeps its own disclosure. They share a position
  and hand over at the middle of the transition (at the cut for "Cut"), so one is always shown and they never
  overlap.
- **Replace / remove / delete.** Changing a photo that affects a disclosure asks first: update it to the new
  photo's wording, remove it, keep it as plain text, or add one — never silently.
- **Checks** (live in the editor, again before export): missing, hidden, not on screen while its photo is,
  clipped at the scene edge, outside the safe area, text overflowing its box, overlapping other copy, too small
  (< 18 px per 1080 px of width), or a photo marked as requiring a disclosure without wording. Quick fixes: Add
  disclosure, Show it, Fit box to text, Move into safe area. The export page lists every problem and asks for
  an explicit "export anyway"; each affected file carries the warning too.
- **Safe area:** 9:16 scenes keep 14 % top / 20 % bottom / 6 % sides clear (Meta's Stories/Reels guidance);
  1080×1620 Outro 6 % / 4 %; other sizes 5 %.
- Stored in the photo's `metadata` (`requiresDisclosure`, `disclosureText`) and the layer's `disclosure` link —
  JSONB fields that already exist, so **no database migration**.

## Motion: Static / No Motion and visibility timing

- **Static / No Motion** (top of the Motion section) turns off entrance, camera motion, transition, exit and
  easing for a layer; the other settings are kept for when it's turned off. Static layers don't take part in
  "With/After previous" sequencing.
- **Visibility** (its own inspector section) says _when_ a layer is on screen, independent of _how_ it moves:
  Whole scene, Custom time range (hard cuts), or — for disclosures — While its photo is on screen.

## Scene durations

Each scene has its own length (Scene inspector → Duration, with 5/6/7/10/15 s quick picks); exports use it
exactly. New Motion Tiles start at **7 s** and new Facebook Build scenes (Intro, Exterior, Interior,
Performance, Outro) at **10 s**; existing scenes keep their saved duration. Exits "at scene end" and
full-length camera motion follow the length automatically; the timing overview warns about anything that runs
past the end.

## Export performance

Measured on this machine (Apple M2 Pro, 12 cores, Demo Mode), 10 s 1080×1920 Intro (300 frames), render cache
cleared, `[export]` server log:

| Chrome GL backend       | Parallel tabs                     | Render time | Frames/s |
| ----------------------- | --------------------------------- | ----------- | -------- |
| swangle (software)      | 3 (old default, browser per call) | 78.8 s      | 3.8      |
| swangle                 | 3 (shared browser)                | 80.2 s      | 3.7      |
| swangle                 | 6                                 | 90.5 s      | 3.3      |
| swangle                 | 8                                 | 94.2 s      | 3.2      |
| angle (GPU / Metal)     | 6                                 | 31.0 s      | 9.7      |
| angle                   | 4                                 | 29.6 s      | 10.1     |
| angle                   | 3                                 | 27.8 s      | 10.8     |
| angle                   | 2                                 | 22.5 s      | 13.4     |
| **angle (new default)** | **1**                             | **19.4 s**  | **15.5** |

- **Optimizations applied:** GPU rendering (`angle`) with one tab — software GL was the bottleneck and extra
  tabs only add contention; one shared Chrome per export job instead of one per file/step.
- **Full Creative Package** (Motion Tile 7 s + five 10 s Build scenes + CTA = 1,710 frames): **106 s**,
  repeatable (106.9 s / 106.2 s, 15–16 fps per scene). The old settings would need ≈ 7.5 min for the same work.
- **Same output:** GPU vs software frames differ only at codec-noise level (PSNR 48–53 dB). If a GPU render
  fails, that file is retried automatically with software GL (verified by fault injection) and flagged.
- **Progress & ETA:** progress grows linearly (~0.9 %/s on the package) and the time-left estimate converged on
  the real finish (107 s) within a few seconds after the first scene.
- **Tune:** `EXPORT_GL` (`angle` | `swangle` | `swiftshader`), `EXPORT_CONCURRENCY`, `EXPORT_REUSE_BROWSER=0`.
  Other machines (e.g. without a usable GPU) may prefer `EXPORT_GL=swangle EXPORT_CONCURRENCY=3`.
- Export standards are unchanged: H.264 High, constant 30 fps, yuv420p, 5 Mbps target, scene size and length.

## Scripts

| Command             | What it does                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`       | Dev server                                                                                                                                           |
| `npm run dev:demo`  | Dev server in local Demo Mode (no Supabase)                                                                                                          |
| `npm run build`     | Production build                                                                                                                                     |
| `npm run lint`      | ESLint                                                                                                                                               |
| `npm run typecheck` | Route type generation + `tsc`                                                                                                                        |
| `npm test`          | Unit tests: geometry, layout presets, schemas, history, layer ops, motion engine, photo slots, asset validation, font parsing, Konva↔CSS consistency |
| `npm run test:db`   | Applies all migrations to in-process Postgres (PGlite); checks RLS isolation, RPCs, asset usage, optimistic concurrency                              |
| `npm run format`    | Prettier                                                                                                                                             |

## Manual verification (Milestone 1)

1. Sign up, then sign in. You land on the Dashboard.
2. **New brand** → "Acura". You're taken to its Brand Kit: change the headline font/size/color → **Save brand kit**.
3. Open the brand → **New project** → Year 2026, Model "MDX" → **Create and open editor**.
4. In the editor, pick the **Interior** scene. Open **Assets** → **Upload photos** → choose a JPG.
5. Select the photo layer (Layers tab or click the canvas), then click the uploaded photo to place it.
   Adjust **Zoom** / **Pan** in the inspector.
6. Click the headline, edit its text, size, weight, tracking and color. Drag and resize it on the canvas.
   Select the gradient and change its stops/angle.
7. Watch the top bar: _Unsaved → Saving… → Saved_. Try ⌘Z / ⇧⌘Z.
8. Reload the page (or go to the Dashboard and reopen the project): every edit is preserved.
9. Conflict check: open the same editor in two tabs, edit the same scene in both — the second tab
   shows a conflict banner offering **Load their version** or **Keep mine**.
10. Brand isolation: create a second brand (e.g. "Honda") and a project under it — its Assets tab is
    empty and its new scenes use the Honda Brand Kit.

## Keyboard shortcuts (editor)

⌘Z undo · ⇧⌘Z / ⌘Y redo · ⌫ delete · ⌘D duplicate · arrows nudge (⇧ ×10) · ⌘] / ⌘[ forward/backward
(⇧ for front/back) · Esc deselect · ⌘+ / ⌘− zoom · ⌘0 fit
