import "server-only";

import { assetMetadataSchema, type Asset, type AssetUsage } from "@/domain/asset";
import { isDemoMode } from "@/lib/demo/mode";
import { demoAssetUsage, demoGetAsset, demoListBrandKitAssets, demoListProjectPhotos } from "@/lib/demo/store";
import type { SessionContext } from "@/lib/supabase/server";

export const ASSET_BUCKET = "assets";
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

export interface AssetRow {
  id: string;
  kind: Asset["kind"];
  brand_id: string | null;
  storage_path: string;
  width: number | null;
  height: number | null;
  original_filename: string;
  mime_type: string;
  project_id: string | null;
  created_at: string;
  display_name: string | null;
  metadata: unknown;
}

export const ASSET_COLUMNS =
  "id, kind, brand_id, storage_path, width, height, original_filename, mime_type, project_id, created_at, display_name, metadata";

async function withSignedUrls(ctx: SessionContext, rows: AssetRow[]): Promise<Asset[]> {
  if (rows.length === 0) return [];
  const { data, error } = await ctx.supabase.storage.from(ASSET_BUCKET).createSignedUrls(
    rows.map((r) => r.storage_path),
    SIGNED_URL_TTL_SECONDS,
  );
  if (error) throw new Error(`Could not sign asset URLs: ${error.message}`);
  const urlByPath = new Map(data.map((d) => [d.path, d.signedUrl]));
  return rows
    .filter((r) => urlByPath.get(r.storage_path))
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      url: urlByPath.get(r.storage_path)!,
      width: r.width,
      height: r.height,
      originalFilename: r.original_filename,
      mimeType: r.mime_type,
      projectId: r.project_id,
      createdAt: r.created_at,
      displayName: r.display_name,
      metadata: assetMetadataSchema.catch({}).parse(r.metadata),
    }));
}

/**
 * The project's photo library: photos uploaded to this project, plus photos its scenes
 * reference from elsewhere in the same brand (e.g. a duplicated project).
 */
export async function listProjectPhotos(
  ctx: SessionContext,
  projectId: string,
  referencedIds: string[] = [],
): Promise<Asset[]> {
  if (isDemoMode()) return demoListProjectPhotos(projectId, referencedIds);
  const ids = referencedIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  let query = ctx.supabase.from("assets").select(ASSET_COLUMNS).eq("kind", "photo");
  query =
    ids.length > 0
      ? query.or(`project_id.eq.${projectId},id.in.(${ids.join(",")})`)
      : query.eq("project_id", projectId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load photos: ${error.message}`);
  return withSignedUrls(ctx, data as AssetRow[]);
}

/** Logos and fonts of one brand's Brand Kit. Never includes other brands' files. */
export async function listBrandKitAssets(ctx: SessionContext, brandId: string): Promise<Asset[]> {
  if (isDemoMode()) return demoListBrandKitAssets(brandId);
  const { data, error } = await ctx.supabase
    .from("assets")
    .select(ASSET_COLUMNS)
    .eq("brand_id", brandId)
    .in("kind", ["logo", "font"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not load Brand Kit assets: ${error.message}`);
  return withSignedUrls(ctx, data as AssetRow[]);
}

export async function getAssetRow(ctx: SessionContext, assetId: string): Promise<AssetRow | null> {
  const { data, error } = await ctx.supabase.from("assets").select(ASSET_COLUMNS).eq("id", assetId).maybeSingle();
  if (error) throw new Error(`Could not load asset: ${error.message}`);
  return (data as AssetRow | null) ?? null;
}

export async function getAssetById(ctx: SessionContext, assetId: string): Promise<Asset | null> {
  if (isDemoMode()) return demoGetAsset(assetId);
  const row = await getAssetRow(ctx, assetId);
  if (!row) return null;
  const [asset] = await withSignedUrls(ctx, [row]);
  return asset ?? null;
}

export async function getAssetUsage(ctx: SessionContext, assetId: string): Promise<AssetUsage[]> {
  if (isDemoMode()) return demoAssetUsage(assetId);
  const { data, error } = await ctx.supabase.rpc("asset_usage", { p_asset_id: assetId });
  if (error) throw new Error(`Could not check where the asset is used: ${error.message}`);
  return (data as { project_id: string; project_name: string; scene_id: string; scene_name: string }[]).map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name,
    sceneId: r.scene_id,
    sceneName: r.scene_name,
  }));
}
