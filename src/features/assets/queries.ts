import "server-only";

import type { Asset } from "@/domain/asset";
import type { SessionContext } from "@/lib/supabase/server";

export const ASSET_BUCKET = "assets";
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

interface AssetRow {
  id: string;
  kind: Asset["kind"];
  storage_path: string;
  width: number | null;
  height: number | null;
  original_filename: string;
  mime_type: string;
  project_id: string | null;
  created_at: string;
}

const ASSET_COLUMNS = "id, kind, storage_path, width, height, original_filename, mime_type, project_id, created_at";

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
    }));
}

/** Photos belonging to one brand. Brand scoping keeps OEM assets from leaking across brands. */
export async function listBrandPhotos(ctx: SessionContext, brandId: string): Promise<Asset[]> {
  const { data, error } = await ctx.supabase
    .from("assets")
    .select(ASSET_COLUMNS)
    .eq("brand_id", brandId)
    .eq("kind", "photo")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load assets: ${error.message}`);
  return withSignedUrls(ctx, data as AssetRow[]);
}

export async function getAssetById(ctx: SessionContext, assetId: string): Promise<Asset | null> {
  const { data, error } = await ctx.supabase.from("assets").select(ASSET_COLUMNS).eq("id", assetId).maybeSingle();
  if (error) throw new Error(`Could not load asset: ${error.message}`);
  if (!data) return null;
  const [asset] = await withSignedUrls(ctx, [data as AssetRow]);
  return asset ?? null;
}
