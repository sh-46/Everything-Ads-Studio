"use server";

import { z } from "zod";
import { sceneDocumentSchema, type Scene } from "@/domain/scene";
import { mapScene, SCENE_COLUMNS, type SceneRow } from "@/features/projects/queries";
import { isDemoMode } from "@/lib/demo/mode";
import { demoSaveScene } from "@/lib/demo/store";
import { requireSession } from "@/lib/supabase/server";

const saveSceneInputSchema = z.object({
  sceneId: z.uuid(),
  expectedRevision: z.number().int().min(1),
  name: z.string().trim().min(1).max(120),
  document: sceneDocumentSchema,
});

export type SaveSceneInput = z.input<typeof saveSceneInputSchema>;

export type SaveSceneResult =
  | { status: "saved"; revision: number; updatedAt: string }
  | { status: "conflict"; current: Scene }
  | { status: "error"; error: string };

/**
 * Compare-and-swap save: succeeds only if nobody else saved since `expectedRevision`.
 * On conflict the current server copy is returned so the editor can let the user choose.
 */
export async function saveScene(input: SaveSceneInput): Promise<SaveSceneResult> {
  const parsed = saveSceneInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { status: "error", error: `Invalid scene data at ${issue.path.join(".")}: ${issue.message}` };
  }
  const { sceneId, expectedRevision, name, document } = parsed.data;
  if (isDemoMode()) {
    return demoSaveScene(parsed.data) ?? { status: "error", error: "Scene not found." };
  }

  const ctx = await requireSession();
  const { data, error } = await ctx.supabase
    .from("scenes")
    .update({ name, document, revision: expectedRevision + 1 })
    .eq("id", sceneId)
    .eq("revision", expectedRevision)
    .select("revision, updated_at");
  if (error) return { status: "error", error: error.message };
  if (data.length > 0) {
    return { status: "saved", revision: data[0].revision as number, updatedAt: data[0].updated_at as string };
  }

  const { data: current, error: loadError } = await ctx.supabase
    .from("scenes")
    .select(SCENE_COLUMNS)
    .eq("id", sceneId)
    .maybeSingle();
  if (loadError) return { status: "error", error: loadError.message };
  if (!current) return { status: "error", error: "Scene not found or you no longer have access to it." };
  return { status: "conflict", current: mapScene(current as SceneRow) };
}
