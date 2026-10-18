import { z } from "zod";

export const ASSET_KINDS = ["photo", "logo", "font"] as const;

export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

export const assetSchema = z.object({
  id: z.uuid(),
  kind: z.enum(ASSET_KINDS),
  /** Short-lived signed URL; never persisted. */
  url: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  originalFilename: z.string(),
  mimeType: z.string(),
  projectId: z.uuid().nullable(),
  createdAt: z.string(),
});

export type Asset = z.infer<typeof assetSchema>;

export const registerAssetInputSchema = z.object({
  projectId: z.uuid(),
  storagePath: z.string().min(1).max(500),
  mimeType: z.enum(PHOTO_MIME_TYPES),
  byteSize: z.number().int().positive().max(MAX_PHOTO_BYTES),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
  originalFilename: z.string().min(1).max(255),
});

export type RegisterAssetInput = z.infer<typeof registerAssetInputSchema>;

/** `{workspace}/{brand}/{project}/{uuid}.{ext}` — the first segment drives storage RLS. */
export function photoStoragePath(
  workspaceId: string,
  brandId: string,
  projectId: string,
  fileId: string,
  mimeType: (typeof PHOTO_MIME_TYPES)[number],
): string {
  const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
  return `${workspaceId}/${brandId}/${projectId}/${fileId}.${ext}`;
}
