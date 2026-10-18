import "server-only";

import { parseBrandKit, type BrandKit } from "@/domain/brand-kit";
import type { SessionContext } from "@/lib/supabase/server";

export interface BrandSummary {
  id: string;
  name: string;
  archivedAt: string | null;
  updatedAt: string;
  projectCount: number;
}

export interface BrandDetail {
  id: string;
  name: string;
  archivedAt: string | null;
  kit: BrandKit;
  kitRevision: number;
}

export async function listBrands(ctx: SessionContext, { includeArchived = false } = {}): Promise<BrandSummary[]> {
  let query = ctx.supabase
    .from("brands")
    .select("id, name, archived_at, updated_at, model_projects(count)")
    .eq("workspace_id", ctx.workspaceId)
    .is("model_projects.archived_at", null)
    .order("name");
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load brands: ${error.message}`);
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
    projectCount: (row.model_projects as unknown as { count: number }[])[0]?.count ?? 0,
  }));
}

interface KitRow {
  kit: unknown;
  revision: number;
}

export async function getBrand(ctx: SessionContext, brandId: string): Promise<BrandDetail | null> {
  const { data, error } = await ctx.supabase
    .from("brands")
    .select("id, name, archived_at, brand_kits(kit, revision)")
    .eq("id", brandId)
    .maybeSingle();
  if (error) throw new Error(`Could not load brand: ${error.message}`);
  if (!data) return null;
  // One-to-one embeds can come back as an object or a single-element array.
  const embedded = data.brand_kits as unknown as KitRow | KitRow[] | null;
  const kitRow = Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
  if (!kitRow) throw new Error(`Brand ${brandId} has no brand kit.`);
  return {
    id: data.id,
    name: data.name,
    archivedAt: data.archived_at,
    kit: parseBrandKit(kitRow.kit),
    kitRevision: kitRow.revision,
  };
}
