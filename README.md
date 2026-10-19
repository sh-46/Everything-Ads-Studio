# Everything Ads Studio

A browser-based production tool for building multi-scene automotive motion ads from static vehicle photography.
Brands (OEMs) have Brand Kits; model projects have scenes; scenes are stacks of editable layers.

Architecture, schema, roadmap and risks: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

Milestone 1 (vertical slice) plus **Phase 2.5 (photo workflow, Brand Kit fonts & logos)** and
**Phase 3 (motion engine & preview)**.

| Area                                                                                                                                                                                            | State                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Auth, workspace, dashboard, brands, Brand Kit, project CRUD                                                                                                                                     | Built                                  |
| Scene editor: text / image / gradient / shape / logo layers, drag, resize, rotate, inspector, undo/redo, shortcuts, layout presets                                                              | Built                                  |
| Autosave with Saving / Saved / Error, retry, revision conflict resolution                                                                                                                       | Built                                  |
| Photo workflow: batch upload, project photo library, Add Image (upload / library / empty frame), canvas drag-and-drop, Replace / Remove keeping layout & motion, safe delete with usage warning | Built                                  |
| Scenes Overview: photo slots per scene (1–2 photos; CTA optional), assign / replace / remove before opening the editor                                                                          | Built                                  |
| Brand Kit fonts (TTF/OTF/WOFF/WOFF2, FontFace loading, metadata detection + correction) and Logo Library (SVG/PNG/WebP, variants)                                                               | Built                                  |
| Motion: entrance, continuous image motion, exit, two-image transitions, sequencing, timing — Motion inspector                                                                                   | Built                                  |
| Scene Preview (Remotion Player: play, pause, restart, scrub) and Full Experience mobile preview incl. Outro + CTA                                                                               | Built                                  |
| Scene duplication                                                                                                                                                                               | Built                                  |
| Multi-select, snapping, workspace invites                                                                                                                                                       | Not started                            |
| MP4 / PNG / ZIP export (render worker)                                                                                                                                                          | Phase 4 — export buttons stay disabled |
| Copy Assistant                                                                                                                                                                                  | Phase 5                                |

## Setup

Requirements: Node 20.9+ and a Supabase project.

1. `npm install`
2. Apply the database migrations in order: open the Supabase SQL editor and run
   `supabase/migrations/0001_init.sql`, `0002_brand_assets.sql`, then `0003_motion_presets.sql` (or
   `supabase db push` with the Supabase CLI). 0001 creates tables, RLS policies, RPCs and the private `assets`
   bucket; 0002 adds logo/font metadata and the `asset_usage` check; 0003 adds project motion presets. Each
   file starts with a security summary.
3. `cp .env.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API). Never add the service-role key.
4. Optional: in Supabase Auth settings, disable "Confirm email" for faster local testing, or set the
   Site URL to `http://localhost:3000` so the confirmation link (`/auth/confirm`) works.
5. `npm run dev` → http://localhost:3000

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
