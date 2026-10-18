import "server-only";

import { exportConfigSchema } from "@/domain/export-config";
import { modelProjectSchema, type ModelProject } from "@/domain/project";
import { sceneSchema, type Scene } from "@/domain/scene";
import type { SessionContext } from "@/lib/supabase/server";

export interface ProjectListItem extends ModelProject {
  brandName: string;
}

const PROJECT_COLUMNS =
  "id, workspace_id, brand_id, name, model_year, model_name, status, export_config, revision, last_edited_at, archived_at, created_at, brands(name)";

interface ProjectRow {
  id: string;
  workspace_id: string;
  brand_id: string;
  name: string;
  model_year: number;
  model_name: string;
  status: string;
  export_config: unknown;
  revision: number;
  last_edited_at: string;
  archived_at: string | null;
  created_at: string;
  brands: { name: string } | { name: string }[] | null;
}

function mapProject(row: ProjectRow): ProjectListItem {
  const exportConfig = exportConfigSchema.safeParse(row.export_config ?? {});
  return {
    ...modelProjectSchema.parse({
      id: row.id,
      workspaceId: row.workspace_id,
      brandId: row.brand_id,
      name: row.name,
      modelYear: row.model_year,
      modelName: row.model_name,
      status: row.status,
      exportConfig: exportConfig.success ? exportConfig.data : exportConfigSchema.parse({}),
      revision: row.revision,
      lastEditedAt: row.last_edited_at,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
    }),
    brandName: (Array.isArray(row.brands) ? row.brands[0]?.name : row.brands?.name) ?? "Unknown brand",
  };
}

export interface ProjectFilters {
  search?: string;
  brandId?: string;
  includeArchived?: boolean;
  limit?: number;
}

export async function listProjects(ctx: SessionContext, filters: ProjectFilters = {}): Promise<ProjectListItem[]> {
  let query = ctx.supabase
    .from("model_projects")
    .select(PROJECT_COLUMNS)
    .eq("workspace_id", ctx.workspaceId)
    .order("last_edited_at", { ascending: false })
    .limit(filters.limit ?? 100);
  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.brandId) query = query.eq("brand_id", filters.brandId);
  const search = filters.search?.trim();
  if (search) {
    // Strip PostgREST filter syntax characters before building the `or` expression.
    const term = search.replace(/[%,()*\\]/g, " ").trim();
    if (term) query = query.or(`name.ilike.%${term}%,model_name.ilike.%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Could not load projects: ${error.message}`);
  return (data as unknown as ProjectRow[]).map(mapProject);
}

export async function getProject(ctx: SessionContext, projectId: string): Promise<ProjectListItem | null> {
  const { data, error } = await ctx.supabase
    .from("model_projects")
    .select(PROJECT_COLUMNS)
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Could not load project: ${error.message}`);
  return data ? mapProject(data as unknown as ProjectRow) : null;
}

export interface SceneRow {
  id: string;
  project_id: string;
  name: string;
  kind: string;
  position: number;
  revision: number;
  document: unknown;
  updated_at: string;
}

export const SCENE_COLUMNS = "id, project_id, name, kind, position, revision, document, updated_at";

export function mapScene(row: SceneRow): Scene {
  return sceneSchema.parse({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    kind: row.kind,
    position: row.position,
    revision: row.revision,
    document: row.document,
    updatedAt: row.updated_at,
  });
}

export async function listScenes(ctx: SessionContext, projectId: string): Promise<Scene[]> {
  const { data, error } = await ctx.supabase
    .from("scenes")
    .select(SCENE_COLUMNS)
    .eq("project_id", projectId)
    .order("position");
  if (error) throw new Error(`Could not load scenes: ${error.message}`);
  return (data as SceneRow[]).map(mapScene);
}
