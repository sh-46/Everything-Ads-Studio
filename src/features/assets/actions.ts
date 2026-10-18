"use server";

import { z } from "zod";
import { registerAssetInputSchema, type Asset, type RegisterAssetInput } from "@/domain/asset";
import { fail, ok, type Result } from "@/lib/result";
import { isDemoMode } from "@/lib/demo/mode";
import { requireSession } from "@/lib/supabase/server";
import { ASSET_BUCKET, getAssetById, listBrandPhotos } from "./queries";

/**
 * Records a photo the browser has already uploaded to Storage. The path is checked
 * against the project's workspace/brand so a client can't register foreign files.
 */
export async function registerPhoto(input: RegisterAssetInput): Promise<Result<Asset>> {
  const parsed = registerAssetInputSchema.safeParse(input);
  if (!parsed.success) return fail(`Invalid upload: ${parsed.error.issues[0].message}`);
  const value = parsed.data;
  // Demo uploads go through /api/demo/assets instead of Supabase Storage.
  if (isDemoMode()) return fail("Not available in Demo Mode.");

  const ctx = await requireSession();
  const { data: project, error: projectError } = await ctx.supabase
    .from("model_projects")
    .select("id, workspace_id, brand_id")
    .eq("id", value.projectId)
    .maybeSingle();
  if (projectError) return fail(`Could not load project: ${projectError.message}`);
  if (!project) return fail("Project not found.");

  const expectedPrefix = `${project.workspace_id}/${project.brand_id}/${project.id}/`;
  const fileName = value.storagePath.slice(expectedPrefix.length);
  if (!value.storagePath.startsWith(expectedPrefix) || fileName.length === 0 || fileName.includes("/")) {
    return fail("Upload path does not belong to this project.");
  }

  const { data: row, error } = await ctx.supabase
    .from("assets")
    .insert({
      workspace_id: project.workspace_id,
      brand_id: project.brand_id,
      project_id: project.id,
      kind: "photo",
      storage_path: value.storagePath,
      mime_type: value.mimeType,
      byte_size: value.byteSize,
      width: value.width,
      height: value.height,
      original_filename: value.originalFilename,
      created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error) {
    // Don't leave an orphaned object behind if the row can't be written.
    await ctx.supabase.storage.from(ASSET_BUCKET).remove([value.storagePath]);
    return fail(`Could not save upload: ${error.message}`);
  }

  const asset = await getAssetById(ctx, row.id as string);
  return asset ? ok(asset) : fail("Upload saved but could not be signed for display.");
}

/** Fresh signed URLs for a brand's photo library (URLs expire after a few hours). */
export async function refreshBrandPhotos(brandId: string): Promise<Result<Asset[]>> {
  const parsedId = z.uuid().safeParse(brandId);
  if (!parsedId.success) return fail("Invalid brand.");
  const ctx = await requireSession();
  try {
    return ok(await listBrandPhotos(ctx, parsedId.data));
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load assets.");
  }
}
