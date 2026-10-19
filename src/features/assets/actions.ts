"use server";

import { z } from "zod";
import {
  ALLOWED_MIME,
  assetMetaUpdateSchema,
  expectedStoragePrefix,
  MAX_BYTES,
  registerAssetInputSchema,
  validateAssetContent,
  type Asset,
  type AssetMetaUpdate,
  type AssetUsage,
  type RegisterAssetInput,
} from "@/domain/asset";
import { isDemoMode } from "@/lib/demo/mode";
import { demoDeleteAsset, demoGetAsset, demoUpdateAssetMeta } from "@/lib/demo/store";
import { fail, ok, type Result } from "@/lib/result";
import { requireSession, type SessionContext } from "@/lib/supabase/server";
import { ASSET_BUCKET, getAssetById, getAssetRow, getAssetUsage } from "./queries";

/**
 * Asset actions. In production the browser uploads straight to private Storage and these
 * actions record/validate the result. In Demo Mode, file bytes go to /api/demo/assets
 * and only the metadata actions below are used.
 */

/** Logos (SVG) and fonts are small enough to verify on the server after upload. */
async function verifyStoredFile(ctx: SessionContext, path: string, mimeType: string): Promise<string | null> {
  if (!(mimeType === "image/svg+xml" || mimeType.startsWith("font/"))) return null;
  const { data, error } = await ctx.supabase.storage.from(ASSET_BUCKET).download(path);
  if (error || !data) return `Could not verify the uploaded file: ${error?.message ?? "missing"}`;
  return validateAssetContent(mimeType, new Uint8Array(await data.arrayBuffer()));
}

async function folderIsValid(ctx: SessionContext, brandId: string, projectId: string | null, path: string) {
  if (projectId) {
    const { data } = await ctx.supabase.from("model_projects").select("brand_id").eq("id", projectId).maybeSingle();
    if (!data || data.brand_id !== brandId) return false;
  }
  const prefix = expectedStoragePrefix(ctx.workspaceId, brandId, projectId);
  const rest = path.slice(prefix.length);
  return path.startsWith(prefix) && rest.length > 0 && !rest.includes("/");
}

export async function registerAsset(input: RegisterAssetInput): Promise<Result<Asset>> {
  const parsed = registerAssetInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (isDemoMode()) return fail("Demo Mode uploads go through /api/demo/assets.");
  const value = parsed.data;

  const ctx = await requireSession();
  const removeUpload = () => ctx.supabase.storage.from(ASSET_BUCKET).remove([value.storagePath]);
  if (!(await folderIsValid(ctx, value.brandId, value.projectId, value.storagePath))) {
    await removeUpload();
    return fail("Upload path does not belong to this brand or project.");
  }
  const contentIssue = await verifyStoredFile(ctx, value.storagePath, value.mimeType);
  if (contentIssue) {
    await removeUpload();
    return fail(contentIssue);
  }

  const { data: row, error } = await ctx.supabase
    .from("assets")
    .insert({
      workspace_id: ctx.workspaceId,
      brand_id: value.brandId,
      project_id: value.projectId,
      kind: value.kind,
      storage_path: value.storagePath,
      mime_type: value.mimeType,
      byte_size: value.byteSize,
      width: value.width,
      height: value.height,
      original_filename: value.originalFilename,
      display_name: value.displayName,
      metadata: value.metadata,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    await removeUpload();
    return fail(`Could not save upload: ${error.message}`);
  }
  const asset = await getAssetById(ctx, row.id as string);
  return asset ? ok(asset) : fail("Upload saved but could not be signed for display.");
}

const replaceFileSchema = z.object({
  storagePath: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(100),
  byteSize: z.number().int().positive(),
  width: z.number().int().positive().max(20_000).nullable(),
  height: z.number().int().positive().max(20_000).nullable(),
  originalFilename: z.string().min(1).max(255),
});

/**
 * Swaps the file behind an asset while keeping its id, so every layer using it updates
 * and no layout or motion changes. The previous file is removed afterwards.
 */
export async function replaceAssetFile(
  assetId: string,
  file: z.input<typeof replaceFileSchema>,
): Promise<Result<Asset>> {
  const parsed = replaceFileSchema.safeParse(file);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (isDemoMode()) return fail("Demo Mode replacements go through /api/demo/assets.");
  const value = parsed.data;

  const ctx = await requireSession();
  const removeUpload = () => ctx.supabase.storage.from(ASSET_BUCKET).remove([value.storagePath]);
  const row = await getAssetRow(ctx, assetId);
  if (!row?.brand_id) {
    await removeUpload();
    return fail("Asset not found.");
  }
  if (!ALLOWED_MIME[row.kind].includes(value.mimeType) || value.byteSize > MAX_BYTES[row.kind]) {
    await removeUpload();
    return fail(`Unsupported or oversized file for a ${row.kind}.`);
  }
  if (!(await folderIsValid(ctx, row.brand_id, row.project_id, value.storagePath))) {
    await removeUpload();
    return fail("Upload path does not belong to this asset's brand or project.");
  }
  const contentIssue = await verifyStoredFile(ctx, value.storagePath, value.mimeType);
  if (contentIssue) {
    await removeUpload();
    return fail(contentIssue);
  }

  const { error } = await ctx.supabase
    .from("assets")
    .update({
      storage_path: value.storagePath,
      mime_type: value.mimeType,
      byte_size: value.byteSize,
      width: value.width,
      height: value.height,
      original_filename: value.originalFilename,
    })
    .eq("id", assetId);
  if (error) {
    await removeUpload();
    return fail(`Could not replace file: ${error.message}`);
  }
  await ctx.supabase.storage.from(ASSET_BUCKET).remove([row.storage_path]);
  const asset = await getAssetById(ctx, assetId);
  return asset ? ok(asset) : fail("Replaced, but the new file could not be signed for display.");
}

export async function updateAssetMeta(assetId: string, update: AssetMetaUpdate): Promise<Result<Asset>> {
  const parsed = assetMetaUpdateSchema.safeParse(update);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (isDemoMode()) {
    const asset = demoUpdateAssetMeta(assetId, parsed.data);
    return asset ? ok(asset) : fail("Asset not found.");
  }
  const ctx = await requireSession();
  const row = await getAssetRow(ctx, assetId);
  if (!row) return fail("Asset not found.");
  const patch: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) patch.display_name = parsed.data.displayName;
  if (parsed.data.metadata) patch.metadata = { ...(row.metadata as object), ...parsed.data.metadata };
  const { error } = await ctx.supabase.from("assets").update(patch).eq("id", assetId);
  if (error) return fail(`Could not update: ${error.message}`);
  const asset = await getAssetById(ctx, assetId);
  return asset ? ok(asset) : fail("Asset not found.");
}

export async function assetUsage(assetId: string): Promise<Result<AssetUsage[]>> {
  if (!z.uuid().safeParse(assetId).success) return fail("Invalid asset.");
  const ctx = await requireSession();
  try {
    return ok(await getAssetUsage(ctx, assetId));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not check usage.");
  }
}

export type DeleteAssetResult = { deleted: true } | { deleted: false; usage: AssetUsage[] };

/**
 * Permanently deletes an uploaded file. If scenes still use it, nothing is deleted unless
 * the caller confirms after seeing the usage list.
 */
export async function deleteAsset(assetId: string, confirmInUse = false): Promise<Result<DeleteAssetResult>> {
  if (!z.uuid().safeParse(assetId).success) return fail("Invalid asset.");
  const ctx = await requireSession();
  const usage = await getAssetUsage(ctx, assetId);
  if (usage.length > 0 && !confirmInUse) return ok({ deleted: false, usage });

  if (isDemoMode()) {
    if (!demoGetAsset(assetId)) return fail("Asset not found.");
    demoDeleteAsset(assetId);
    return ok({ deleted: true });
  }
  const row = await getAssetRow(ctx, assetId);
  if (!row) return fail("Asset not found.");
  const { error } = await ctx.supabase.from("assets").delete().eq("id", assetId);
  if (error) return fail(`Could not delete: ${error.message}`);
  await ctx.supabase.storage.from(ASSET_BUCKET).remove([row.storage_path]);
  return ok({ deleted: true });
}
