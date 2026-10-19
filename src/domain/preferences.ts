import { z } from "zod";

/** Per-user editor preferences (stored in `profiles.preferences`). Unknown keys are kept. */
export const editorPreferencesSchema = z
  .object({
    /** Canvas zoom: "fit" or a fixed scale. */
    zoom: z.union([z.literal("fit"), z.number().min(0.05).max(4)]).optional(),
    /** Last scene opened in each project's editor. */
    lastSceneByProject: z.record(z.uuid(), z.uuid()).optional(),
  })
  .loose();

export type EditorPreferences = z.infer<typeof editorPreferencesSchema>;

/** Most-recent 100 projects only, so the profile row stays small. */
export const MAX_REMEMBERED_PROJECTS = 100;

export function mergePreferences(current: EditorPreferences, patch: EditorPreferences): EditorPreferences {
  // Insertion order is recency: patched projects move to the end; the oldest drop off.
  const scenes = { ...current.lastSceneByProject };
  for (const [projectId, sceneId] of Object.entries(patch.lastSceneByProject ?? {})) {
    delete scenes[projectId];
    scenes[projectId] = sceneId;
  }
  const recent = Object.entries(scenes).slice(-MAX_REMEMBERED_PROJECTS);
  return { ...current, ...patch, lastSceneByProject: Object.fromEntries(recent) };
}
