import { z } from "zod";

/** Project-level export settings. Consumed by the render worker in Phase 4. */
export const exportConfigSchema = z.object({
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(30),
  /** Output scale relative to scene size (1 = native 1080-wide). */
  scale: z.number().min(0.25).max(2).default(1),
  videoFormat: z.enum(["mp4"]).default("mp4"),
  imageFormat: z.enum(["png", "jpg"]).default("png"),
  filenamePattern: z.string().min(1).max(200).optional(),
});

export type ExportConfig = z.infer<typeof exportConfigSchema>;

export function defaultExportConfig(): ExportConfig {
  return exportConfigSchema.parse({});
}

export function formatExportName(
  pattern: string,
  tokens: { brand: string; year: number; model: string; scene: string; width: number; height: number },
): string {
  const slug = (value: string) =>
    value
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return pattern
    .replaceAll("{brand}", slug(tokens.brand))
    .replaceAll("{year}", String(tokens.year))
    .replaceAll("{model}", slug(tokens.model))
    .replaceAll("{scene}", slug(tokens.scene))
    .replaceAll("{width}", String(tokens.width))
    .replaceAll("{height}", String(tokens.height));
}
