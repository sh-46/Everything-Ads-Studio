"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseBrandKit } from "@/domain/brand-kit";
import { defaultExportConfig } from "@/domain/export-config";
import { PROJECT_STATUSES, projectMetaInputSchema, type ProjectMetaInput } from "@/domain/project";
import { defaultProjectScenes } from "@/domain/scene-templates";
import { isDemoMode } from "@/lib/demo/mode";
import * as demo from "@/lib/demo/store";
import { fail, ok, type Result } from "@/lib/result";
import { requireSession } from "@/lib/supabase/server";

export async function createProject(brandId: string, input: ProjectMetaInput): Promise<Result<{ id: string }>> {
  const parsed = projectMetaInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (isDemoMode()) {
    const id = demo.demoCreateProject(brandId, parsed.data);
    if (!id) return fail("Brand not found.");
    revalidatePath(`/brands/${brandId}`);
    revalidatePath("/dashboard");
    return ok({ id });
  }

  const ctx = await requireSession();
  const { data: kitRow, error: kitError } = await ctx.supabase
    .from("brand_kits")
    .select("kit")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (kitError) return fail(`Could not load brand kit: ${kitError.message}`);
  if (!kitRow) return fail("Brand not found.");

  const kit = parseBrandKit(kitRow.kit);
  const { data, error } = await ctx.supabase.rpc("create_model_project", {
    p_workspace_id: ctx.workspaceId,
    p_brand_id: brandId,
    p_name: parsed.data.name,
    p_model_year: parsed.data.modelYear,
    p_model_name: parsed.data.modelName,
    p_export_config: defaultExportConfig(),
    p_scenes: defaultProjectScenes(kit),
  });
  if (error) return fail(`Could not create project: ${error.message}`);

  revalidatePath(`/brands/${brandId}`);
  revalidatePath("/dashboard");
  return ok({ id: data as string });
}

export async function updateProjectMeta(projectId: string, input: ProjectMetaInput): Promise<Result> {
  const parsed = projectMetaInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (isDemoMode()) {
    if (!demo.demoUpdateProject(projectId, parsed.data)) return fail("Project not found.");
    revalidatePath(`/projects/${projectId}`, "layout");
    return ok();
  }

  const ctx = await requireSession();
  const { error } = await ctx.supabase
    .from("model_projects")
    .update({
      name: parsed.data.name,
      model_year: parsed.data.modelYear,
      model_name: parsed.data.modelName,
      last_edited_at: new Date().toISOString(),
    })
    .eq("id", projectId);
  if (error) return fail(`Could not update project: ${error.message}`);

  revalidatePath(`/projects/${projectId}`, "layout");
  return ok();
}

export async function setProjectStatus(projectId: string, status: string): Promise<Result> {
  const parsed = z.enum(PROJECT_STATUSES).safeParse(status);
  if (!parsed.success) return fail("Unknown status.");
  if (isDemoMode()) {
    if (!demo.demoUpdateProject(projectId, { status: parsed.data })) return fail("Project not found.");
    revalidatePath(`/projects/${projectId}`, "layout");
    return ok();
  }

  const ctx = await requireSession();
  const { error } = await ctx.supabase.from("model_projects").update({ status: parsed.data }).eq("id", projectId);
  if (error) return fail(`Could not update status: ${error.message}`);

  revalidatePath(`/projects/${projectId}`, "layout");
  return ok();
}

export async function duplicateProject(projectId: string, name: string): Promise<Result<{ id: string }>> {
  const parsed = projectMetaInputSchema.shape.name.safeParse(name);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  if (isDemoMode()) {
    const id = demo.demoDuplicateProject(projectId, parsed.data);
    if (!id) return fail("Project not found.");
    revalidatePath("/dashboard");
    return ok({ id });
  }

  const ctx = await requireSession();
  const { data, error } = await ctx.supabase.rpc("duplicate_model_project", {
    p_project_id: projectId,
    p_name: parsed.data,
  });
  if (error) return fail(`Could not duplicate project: ${error.message}`);

  revalidatePath("/dashboard");
  return ok({ id: data as string });
}

export async function setProjectArchived(projectId: string, archived: boolean): Promise<Result> {
  if (isDemoMode()) {
    if (!demo.demoUpdateProject(projectId, { archived })) return fail("Project not found.");
    revalidatePath(`/projects/${projectId}`, "layout");
    revalidatePath("/dashboard");
    return ok();
  }
  const ctx = await requireSession();
  const { error } = await ctx.supabase
    .from("model_projects")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", projectId);
  if (error) return fail(`Could not update project: ${error.message}`);

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/dashboard");
  return ok();
}
