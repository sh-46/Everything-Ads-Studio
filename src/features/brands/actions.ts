"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { brandKitSchema, defaultBrandKit } from "@/domain/brand-kit";
import { isDemoMode } from "@/lib/demo/mode";
import * as demo from "@/lib/demo/store";
import { fail, ok, type Result } from "@/lib/result";
import { requireSession } from "@/lib/supabase/server";

const brandNameSchema = z.string().trim().min(1, "Brand name is required").max(120);

export async function createBrand(name: string): Promise<Result<{ id: string }>> {
  const parsed = brandNameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (isDemoMode()) {
    const id = demo.demoCreateBrand(parsed.data);
    revalidatePath("/brands");
    revalidatePath("/dashboard");
    return ok({ id });
  }

  const ctx = await requireSession();
  const { data, error } = await ctx.supabase.rpc("create_brand", {
    p_workspace_id: ctx.workspaceId,
    p_name: parsed.data,
    p_kit: defaultBrandKit(),
  });
  if (error) return fail(`Could not create brand: ${error.message}`);

  revalidatePath("/brands");
  revalidatePath("/dashboard");
  return ok({ id: data as string });
}

export async function renameBrand(brandId: string, name: string): Promise<Result> {
  const parsed = brandNameSchema.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (isDemoMode() && !demo.demoUpdateBrand(brandId, { name: parsed.data })) return fail("Brand not found.");

  if (!isDemoMode()) {
    const ctx = await requireSession();
    const { error } = await ctx.supabase.from("brands").update({ name: parsed.data }).eq("id", brandId);
    if (error) return fail(`Could not rename brand: ${error.message}`);
  }

  revalidatePath(`/brands/${brandId}`, "layout");
  revalidatePath("/brands");
  return ok();
}

export async function setBrandArchived(brandId: string, archived: boolean): Promise<Result> {
  if (isDemoMode()) {
    if (!demo.demoUpdateBrand(brandId, { archived })) return fail("Brand not found.");
    revalidatePath("/brands");
    revalidatePath("/dashboard");
    return ok();
  }
  const ctx = await requireSession();
  const { error } = await ctx.supabase
    .from("brands")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", brandId);
  if (error) return fail(`Could not update brand: ${error.message}`);

  revalidatePath("/brands");
  revalidatePath("/dashboard");
  return ok();
}

/**
 * Saves the brand kit with optimistic concurrency. Existing projects keep the values
 * already copied into their layers; the kit applies to new layers and layouts.
 */
export async function updateBrandKit(
  brandId: string,
  expectedRevision: number,
  kit: unknown,
): Promise<Result<{ revision: number }>> {
  const parsed = brandKitSchema.safeParse(kit);
  if (!parsed.success) return fail(`Invalid brand kit: ${parsed.error.issues[0].message}`);
  if (isDemoMode()) {
    const revision = demo.demoUpdateBrandKit(brandId, expectedRevision, parsed.data);
    if (revision === null) return fail("Brand not found.");
    if (revision === "conflict")
      return fail("This brand kit was changed elsewhere. Reload the page to get the latest version.");
    revalidatePath(`/brands/${brandId}`, "layout");
    return ok({ revision });
  }

  const ctx = await requireSession();
  const { data, error } = await ctx.supabase
    .from("brand_kits")
    .update({ kit: parsed.data, revision: expectedRevision + 1 })
    .eq("brand_id", brandId)
    .eq("revision", expectedRevision)
    .select("revision");
  if (error) return fail(`Could not save brand kit: ${error.message}`);
  if (data.length === 0) {
    return fail("This brand kit was changed elsewhere. Reload the page to get the latest version.");
  }

  revalidatePath(`/brands/${brandId}`, "layout");
  return ok({ revision: data[0].revision as number });
}
