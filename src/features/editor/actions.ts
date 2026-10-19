"use server";

import { z } from "zod";
import type { Asset } from "@/domain/asset";
import { parseBrandKit, type BrandKit } from "@/domain/brand-kit";
import {
  applyDisclosureDecision,
  planPhotoChange,
  syncDisclosuresForAsset,
  type DisclosureDecision,
} from "@/domain/disclosures";
import { sceneDocumentSchema, type Scene, type SceneDocument } from "@/domain/scene";
import { assignScenePhoto as applyPhoto, scenePhotoLayers, type PhotoSlot } from "@/domain/scene-photos";
import { getAssetById } from "@/features/assets/queries";
import { getProject, listScenes, mapScene, SCENE_COLUMNS, type SceneRow } from "@/features/projects/queries";
import { isDemoMode } from "@/lib/demo/mode";
import {
  demoDuplicateScene,
  demoGetAsset,
  demoGetSceneWithBrand,
  demoListScenes,
  demoSaveScene,
} from "@/lib/demo/store";
import { getSession, requireSession } from "@/lib/supabase/server";

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

  // No redirect on a lapsed session: the editor keeps the edits and retries after sign-in.
  const ctx = await getSession();
  if (!ctx) {
    return { status: "error", error: "Your session expired — sign in again in another tab; edits are kept here" };
  }
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

const assignInputSchema = z.object({
  sceneId: z.uuid(),
  expectedRevision: z.number().int().min(1),
  slot: z.union([z.literal(1), z.literal(2)]),
  assetId: z.uuid().nullable(),
  /** The user's answer to the disclosure question (see `planPhotoChange`); default "apply". */
  disclosure: z.enum(["apply", "skip", "keepAsText"]).default("apply"),
});

export type AssignScenePhotoResult = { status: "saved"; scene: Scene } | Exclude<SaveSceneResult, { status: "saved" }>;

/** Photos referenced by a scene (frames and disclosure links) plus `extra`, with metadata. */
function assetIdsOf(doc: SceneDocument, extra: (string | null)[]): string[] {
  const ids = new Set<string>(extra.filter((id): id is string => Boolean(id)));
  for (const l of doc.layers) {
    if (l.type === "image" && l.assetId) ids.add(l.assetId);
    if (l.type === "text" && l.disclosure) ids.add(l.disclosure.assetId);
  }
  return [...ids];
}

/** Applies the photo and its disclosure decision to a document (pure). */
function assignWithDisclosure(
  doc: SceneDocument,
  slot: PhotoSlot,
  asset: Asset | null,
  decision: DisclosureDecision,
  assets: Map<string, Asset>,
  kit: BrandKit,
): SceneDocument {
  const frameBefore = scenePhotoLayers(doc)[slot === 1 ? "slot1" : "slot2"];
  const plan = planPhotoChange(doc, frameBefore?.id ?? null, asset, assets);
  const next = applyPhoto(doc, slot, asset?.id ?? null, kit);
  const frame = frameBefore ?? scenePhotoLayers(next)[slot === 1 ? "slot1" : "slot2"];
  return frame ? applyDisclosureDecision(next, frame.id, plan, decision, assets, kit) : next;
}

/**
 * Assigns (or clears) a scene's photo slot from the Scenes Overview. Only the frame's
 * asset reference changes; layout, crop and motion stay as they are. The photo's
 * disclosure follows the user's decision. Uses the same revision check as the editor,
 * so an open editor tab sees a conflict instead of silently overwriting.
 */
export async function assignScenePhoto(input: z.input<typeof assignInputSchema>): Promise<AssignScenePhotoResult> {
  const parsed = assignInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", error: parsed.error.issues[0].message };
  const { sceneId, expectedRevision, slot, assetId, disclosure } = parsed.data;

  if (isDemoMode()) {
    const found = demoGetSceneWithBrand(sceneId);
    if (!found) return { status: "error", error: "Scene not found." };
    if (assetId) {
      const asset = demoGetAsset(assetId);
      if (!asset || asset.kind !== "photo" || asset.brandId !== found.brandId) {
        return { status: "error", error: "That photo belongs to a different brand." };
      }
    }
    if (found.scene.revision !== expectedRevision) return { status: "conflict", current: found.scene };
    const assets = new Map(
      assetIdsOf(found.scene.document, [assetId])
        .map((id) => demoGetAsset(id))
        .filter((a): a is Asset & { brandId: string } => a !== null)
        .map((a) => [a.id, a]),
    );
    const document = assignWithDisclosure(
      found.scene.document,
      slot,
      assetId ? (assets.get(assetId) ?? null) : null,
      disclosure,
      assets,
      found.kit,
    );
    const saved = demoSaveScene({ sceneId, expectedRevision, name: found.scene.name, document });
    if (!saved) return { status: "error", error: "Scene not found." };
    if (saved.status === "conflict") return saved;
    return {
      status: "saved",
      scene: { ...found.scene, document, revision: saved.revision, updatedAt: saved.updatedAt },
    };
  }

  const ctx = await requireSession();
  const { data: row, error } = await ctx.supabase
    .from("scenes")
    .select(`${SCENE_COLUMNS}, model_projects(brand_id)`)
    .eq("id", sceneId)
    .maybeSingle();
  if (error) return { status: "error", error: error.message };
  if (!row) return { status: "error", error: "Scene not found." };
  const scene = mapScene(row as unknown as SceneRow);
  const project = (row as unknown as { model_projects: { brand_id: string } | { brand_id: string }[] }).model_projects;
  const brandId = Array.isArray(project) ? project[0]?.brand_id : project?.brand_id;
  if (scene.revision !== expectedRevision) return { status: "conflict", current: scene };

  if (assetId) {
    const { data: asset } = await ctx.supabase.from("assets").select("kind, brand_id").eq("id", assetId).maybeSingle();
    if (!asset || asset.kind !== "photo" || asset.brand_id !== brandId) {
      return { status: "error", error: "That photo belongs to a different brand." };
    }
  }
  const { data: kitRow } = await ctx.supabase.from("brand_kits").select("kit").eq("brand_id", brandId).maybeSingle();
  const loaded = await Promise.all(assetIdsOf(scene.document, [assetId]).map((id) => getAssetById(ctx, id)));
  const assets = new Map(loaded.filter((a): a is Asset => a !== null).map((a) => [a.id, a]));
  const document = assignWithDisclosure(
    scene.document,
    slot,
    assetId ? (assets.get(assetId) ?? null) : null,
    disclosure,
    assets,
    parseBrandKit(kitRow?.kit),
  );
  const saved = await saveScene({ sceneId, expectedRevision, name: scene.name, document });
  if (saved.status !== "saved") return saved;
  return { status: "saved", scene: { ...scene, document, revision: saved.revision, updatedAt: saved.updatedAt } };
}

export type SyncDisclosureResult =
  { ok: true; scenes: Scene[]; added: number; removed: number; conflicts: string[] } | { ok: false; error: string };

/**
 * After a photo's disclosure changes in the project photo library: adds the missing
 * disclosure layers where it's now required, or removes them where it no longer is.
 * Each scene is saved with the usual revision check; scenes changed elsewhere meanwhile
 * are reported (the editor's review flags them) rather than overwritten.
 */
export async function syncPhotoDisclosure(projectId: string, assetId: string): Promise<SyncDisclosureResult> {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(assetId).success) {
    return { ok: false, error: "Invalid request." };
  }
  let scenes: Scene[];
  let asset: Asset | null;
  let kit: BrandKit;
  if (isDemoMode()) {
    scenes = demoListScenes(projectId);
    asset = demoGetAsset(assetId);
    const found = scenes[0] ? demoGetSceneWithBrand(scenes[0].id) : null;
    if (!found) return { ok: false, error: "Project not found." };
    kit = found.kit;
  } else {
    const ctx = await requireSession();
    const project = await getProject(ctx, projectId);
    if (!project) return { ok: false, error: "Project not found." };
    scenes = await listScenes(ctx, projectId);
    asset = await getAssetById(ctx, assetId);
    const { data: kitRow } = await ctx.supabase
      .from("brand_kits")
      .select("kit")
      .eq("brand_id", project.brandId)
      .maybeSingle();
    kit = parseBrandKit(kitRow?.kit);
  }
  if (!asset || asset.kind !== "photo" || asset.projectId !== projectId)
    return { ok: false, error: "Photo not found." };

  const updated: Scene[] = [];
  const conflicts: string[] = [];
  let added = 0;
  let removed = 0;
  for (const scene of scenes) {
    const result = syncDisclosuresForAsset(scene.document, asset, kit);
    if (!result.changed) continue;
    const saved = await saveScene({
      sceneId: scene.id,
      expectedRevision: scene.revision,
      name: scene.name,
      document: result.doc,
    });
    if (saved.status === "saved") {
      added += result.added;
      removed += result.removed;
      updated.push({ ...scene, document: result.doc, revision: saved.revision, updatedAt: saved.updatedAt });
    } else {
      conflicts.push(scene.name);
    }
  }
  return { ok: true, scenes: updated, added, removed, conflicts };
}

const duplicateInputSchema = z.object({
  sourceSceneId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  document: sceneDocumentSchema,
});

/** Creates a copy of a scene (its current editor state) at the end of the project. */
export async function duplicateScene(
  input: z.input<typeof duplicateInputSchema>,
): Promise<{ ok: true; scene: Scene } | { ok: false; error: string }> {
  const parsed = duplicateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { sourceSceneId, name, document } = parsed.data;

  if (isDemoMode()) {
    const scene = demoDuplicateScene(sourceSceneId, name, document);
    return scene ? { ok: true, scene } : { ok: false, error: "Scene not found." };
  }

  const ctx = await requireSession();
  const { data: source, error } = await ctx.supabase
    .from("scenes")
    .select("project_id, workspace_id, kind")
    .eq("id", sourceSceneId)
    .maybeSingle();
  if (error || !source) return { ok: false, error: error?.message ?? "Scene not found." };
  const { data: last } = await ctx.supabase
    .from("scenes")
    .select("position")
    .eq("project_id", source.project_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: inserted, error: insertError } = await ctx.supabase
    .from("scenes")
    .insert({
      project_id: source.project_id,
      workspace_id: source.workspace_id,
      kind: source.kind,
      name,
      position: ((last?.position as number | undefined) ?? 0) + 1,
      document,
    })
    .select(SCENE_COLUMNS)
    .single();
  if (insertError) return { ok: false, error: insertError.message };
  return { ok: true, scene: mapScene(inserted as SceneRow) };
}
