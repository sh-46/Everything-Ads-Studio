# Everything Ads Studio

A browser-based production tool for building multi-scene automotive motion ads from static vehicle photography.
Brands (OEMs) have Brand Kits; model projects have scenes; scenes are stacks of editable layers.

Architecture, schema, roadmap and risks: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Status

**Milestone 1 (vertical slice): Create Brand → Create Model Project → Upload Photo → Edit Scene → Save → Reopen.**

| Area                                                                                                                                                                      | State                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Auth (email + password), personal workspace                                                                                                                               | Built                                        |
| Dashboard: recent projects, search, brand filter, archived toggle                                                                                                         | Built                                        |
| Brands + Brand Kit (colors, typography, scrim, CTA, export naming)                                                                                                        | Built                                        |
| Model projects: create (7 standard scenes), edit details, status, duplicate, archive                                                                                      | Built                                        |
| Photo upload (JPG/PNG/WebP → private Storage, signed URLs)                                                                                                                | Built                                        |
| Scene editor: text / image / gradient / shape layers, drag, resize, rotate, inspector, align, reorder, undo/redo, shortcuts, zoom/fit, 5 layout presets, scene dimensions | Built                                        |
| Autosave with Saving / Saved / Error states, retry, revision conflict resolution                                                                                          | Built                                        |
| Logo layers, brand font upload, multi-select, snapping                                                                                                                    | Milestone 2                                  |
| Motion presets, playback, Remotion preview                                                                                                                                | Phase 3 (UI shows status, controls disabled) |
| MP4 / PNG / ZIP export                                                                                                                                                    | Phase 4 (UI shows status, controls disabled) |
| Copy Assistant                                                                                                                                                            | Phase 5                                      |

## Setup

Requirements: Node 20.9+ and a Supabase project.

1. `npm install`
2. Apply the database migration: open the Supabase SQL editor and run
   `supabase/migrations/0001_init.sql` (or `supabase db push` if you use the Supabase CLI).
   It creates tables, RLS policies, RPCs and the private `assets` storage bucket — see the
   security summary at the top of the file.
3. `cp .env.example .env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings → API). Never add the service-role key.
4. Optional: in Supabase Auth settings, disable "Confirm email" for faster local testing, or set the
   Site URL to `http://localhost:3000` so the confirmation link (`/auth/confirm`) works.
5. `npm run dev` → http://localhost:3000

## Scripts

| Command             | What it does                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `npm run dev`       | Dev server                                                                                                   |
| `npm run build`     | Production build                                                                                             |
| `npm run lint`      | ESLint                                                                                                       |
| `npm run typecheck` | Route type generation + `tsc`                                                                                |
| `npm test`          | Unit tests (geometry, layout presets, schemas, history, layer ops)                                           |
| `npm run test:db`   | Applies migrations to in-process Postgres (PGlite) and checks RLS isolation, RPCs and optimistic concurrency |
| `npm run format`    | Prettier                                                                                                     |

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
