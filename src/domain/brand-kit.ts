import { z } from "zod";
import { hexColorSchema } from "./color";
import { gradientFillSchema } from "./gradient";
import { CONTINUOUS_PRESETS, easingSchema, ENTRANCE_MOVES, migrateEntrance } from "./motion";
import { TYPE_STYLE_REFS, type TypeStyleRef } from "./scene";

export const BRAND_KIT_SCHEMA_VERSION = 1;

/** Kits saved before combinable entrances stored a single `entrancePreset`. */
function migrateKitMotion(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("entrancePreset" in value)) return value;
  const { entrancePreset, ...rest } = value as Record<string, unknown>;
  const migrated = migrateEntrance({ preset: entrancePreset }) as { fade: boolean; move: string };
  return { ...rest, entranceFade: migrated.fade, entranceMove: migrated.move };
}

export const typeStyleSchema = z.object({
  fontFamily: z.string().min(1),
  fontSize: z.number().min(4).max(1000),
  fontWeight: z.number().int().min(100).max(900),
  letterSpacing: z.number().min(-50).max(200),
  lineHeight: z.number().min(0.5).max(4),
  color: hexColorSchema,
});

export type TypeStyle = z.infer<typeof typeStyleSchema>;

export const brandColorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  value: hexColorSchema,
});

export const brandKitSchema = z.object({
  schemaVersion: z.literal(BRAND_KIT_SCHEMA_VERSION),
  colors: z.object({
    background: hexColorSchema,
    primary: hexColorSchema,
    accent: hexColorSchema,
    text: hexColorSchema,
    palette: z.array(brandColorSchema).max(24).default([]),
  }),
  typography: z.object(
    Object.fromEntries(TYPE_STYLE_REFS.map((ref) => [ref, typeStyleSchema])) as Record<
      TypeStyleRef,
      typeof typeStyleSchema
    >,
  ),
  /** Default scrim used by layout presets over photography. */
  scrim: gradientFillSchema,
  cta: z.object({
    label: z.string().min(1).max(40),
    background: hexColorSchema,
    textColor: hexColorSchema,
    cornerRadius: z.number().min(0).max(200),
  }),
  /** Applied when layers are created; never re-applied to existing layers. */
  motionDefaults: z.preprocess(
    migrateKitMotion,
    z.object({
      /** Entrance for new text and logo layers: fade and/or movement. */
      entranceFade: z.boolean(),
      entranceMove: z.enum(ENTRANCE_MOVES),
      entranceDurationMs: z.number().int().min(0).max(20_000),
      easing: easingSchema,
      /** Continuous motion for new photo layers. */
      photoMotion: z.enum(CONTINUOUS_PRESETS).default("slowZoomIn"),
    }),
  ),
  /** Tokens: {brand} {year} {model} {scene} {width} {height}. */
  exportNaming: z.object({
    pattern: z.string().min(1).max(200),
  }),
  /** Deprecated: logos and fonts live in the assets table (kind "logo" / "font"). Kept for compatibility. */
  logoAssetIds: z.array(z.uuid()).default([]),
  fontAssetIds: z.array(z.uuid()).default([]),
});

export type BrandKit = z.infer<typeof brandKitSchema>;

export function defaultBrandKit(): BrandKit {
  const sans = "Helvetica Neue";
  return {
    schemaVersion: BRAND_KIT_SCHEMA_VERSION,
    colors: {
      background: "#0B0B0C",
      primary: "#FFFFFF",
      accent: "#C8102E",
      text: "#FFFFFF",
      palette: [],
    },
    typography: {
      headline: {
        fontFamily: sans,
        fontSize: 88,
        fontWeight: 700,
        letterSpacing: -1,
        lineHeight: 1.05,
        color: "#FFFFFF",
      },
      subtitle: {
        fontFamily: sans,
        fontSize: 40,
        fontWeight: 400,
        letterSpacing: 0,
        lineHeight: 1.25,
        color: "#E6E6E6",
      },
      body: { fontFamily: sans, fontSize: 32, fontWeight: 400, letterSpacing: 0, lineHeight: 1.35, color: "#E6E6E6" },
      cta: { fontFamily: sans, fontSize: 44, fontWeight: 600, letterSpacing: 1, lineHeight: 1, color: "#FFFFFF" },
    },
    scrim: {
      gradientType: "linear",
      angle: 180,
      stops: [
        { offset: 0, color: "#000000", opacity: 0 },
        { offset: 1, color: "#000000", opacity: 0.85 },
      ],
    },
    cta: { label: "Learn More", background: "#FFFFFF", textColor: "#0B0B0C", cornerRadius: 12 },
    motionDefaults: {
      entranceFade: true,
      entranceMove: "slideUp",
      entranceDurationMs: 700,
      easing: "easeOut",
      photoMotion: "slowZoomIn",
    },
    exportNaming: { pattern: "{brand}_{year}_{model}_{scene}_{width}x{height}" },
    logoAssetIds: [],
    fontAssetIds: [],
  };
}

/** Parses a stored kit, falling back to defaults for anything missing or invalid. */
export function parseBrandKit(raw: unknown): BrandKit {
  const result = brandKitSchema.safeParse(raw);
  return result.success ? result.data : defaultBrandKit();
}
