import { z } from "zod";
import { exportConfigSchema } from "./export-config";

export const PROJECT_STATUSES = ["draft", "in_review", "approved"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
};

export const modelProjectSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  brandId: z.uuid(),
  name: z.string().min(1).max(160),
  modelYear: z.number().int().min(1900).max(2100),
  modelName: z.string().min(1).max(120),
  status: z.enum(PROJECT_STATUSES),
  exportConfig: exportConfigSchema,
  revision: z.number().int().min(1),
  lastEditedAt: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type ModelProject = z.infer<typeof modelProjectSchema>;

/** Input for creating or editing project metadata. */
export const projectMetaInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  modelYear: z.coerce.number().int().min(1900).max(2100),
  modelName: z.string().trim().min(1, "Model name is required").max(120),
});

export type ProjectMetaInput = z.infer<typeof projectMetaInputSchema>;
