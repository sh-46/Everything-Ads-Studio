import { z } from "zod";
import { hexColorSchema } from "./color";
import { gradientFillSchema } from "./gradient";
import { defaultMotion, motionConfigSchema } from "./motion";

/**
 * The scene document is the single contract between the editor (Konva), preview
 * (Remotion Player) and export (Remotion renderer). All geometry is in logical scene
 * pixels; viewport scaling never changes stored values.
 *
 * Transform conventions:
 * - (x, y) is the layer's top-left corner before rotation.
 * - rotation is in degrees, clockwise, around (x, y) — CSS `transform-origin: 0 0`.
 * - layers[0] is drawn first (bottom of the stack).
 */

export const SCENE_SCHEMA_VERSION = 1;

export const SCENE_KINDS = ["intro", "exterior", "interior", "performance", "outro", "feed", "cta", "custom"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

/** Semantic slot a layer fills. Layout presets use it to carry content across layouts. */
export const LAYER_ROLES = [
  "primaryImage",
  "secondaryImage",
  "headline",
  "subtitle",
  "scrim",
  "cta",
  "ctaButton",
  "logo",
] as const;
export type LayerRole = (typeof LAYER_ROLES)[number];

export const TYPE_STYLE_REFS = ["headline", "subtitle", "body", "cta"] as const;
export type TypeStyleRef = (typeof TYPE_STYLE_REFS)[number];

const baseLayerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  role: z.enum(LAYER_ROLES).optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().min(1),
  height: z.number().min(1),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  motion: motionConfigSchema.prefault({}),
});

export const textLayerSchema = baseLayerSchema.extend({
  type: z.literal("text"),
  text: z.string().max(2000),
  styleRef: z.enum(TYPE_STYLE_REFS).optional(),
  fontFamily: z.string().min(1),
  fontSize: z.number().min(4).max(1000),
  fontWeight: z.number().int().min(100).max(900),
  letterSpacing: z.number().min(-50).max(200).default(0),
  lineHeight: z.number().min(0.5).max(4).default(1.15),
  color: hexColorSchema,
  align: z.enum(["left", "center", "right"]).default("left"),
});

export const imageFitSchema = z.enum(["cover", "contain", "fill"]);
export type ImageFit = z.infer<typeof imageFitSchema>;

export const imageLayerSchema = baseLayerSchema.extend({
  type: z.literal("image"),
  assetId: z.uuid().nullable(),
  fit: imageFitSchema.default("cover"),
  /** Focal point 0–1; same meaning as CSS `object-position` percentages. */
  focalX: z.number().min(0).max(1).default(0.5),
  focalY: z.number().min(0).max(1).default(0.5),
  /** Additional zoom inside the frame (1 = fit exactly). */
  zoom: z.number().min(1).max(5).default(1),
});

export const gradientLayerSchema = baseLayerSchema.extend({
  type: z.literal("gradient"),
  fill: gradientFillSchema,
});

export const shapeLayerSchema = baseLayerSchema.extend({
  type: z.literal("shape"),
  shape: z.enum(["rect", "ellipse"]).default("rect"),
  fill: hexColorSchema,
  cornerRadius: z.number().min(0).max(2000).default(0),
});

export const logoLayerSchema = baseLayerSchema.extend({
  type: z.literal("logo"),
  assetId: z.uuid().nullable(),
});

export const layerSchema = z.discriminatedUnion("type", [
  textLayerSchema,
  imageLayerSchema,
  gradientLayerSchema,
  shapeLayerSchema,
  logoLayerSchema,
]);

export type TextLayer = z.infer<typeof textLayerSchema>;
export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type GradientLayer = z.infer<typeof gradientLayerSchema>;
export type ShapeLayer = z.infer<typeof shapeLayerSchema>;
export type LogoLayer = z.infer<typeof logoLayerSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type LayerType = Layer["type"];

export const sceneDocumentSchema = z.object({
  schemaVersion: z.literal(SCENE_SCHEMA_VERSION),
  width: z.number().int().min(16).max(4096),
  height: z.number().int().min(16).max(4096),
  background: hexColorSchema,
  durationMs: z.number().int().min(500).max(120_000).default(6000),
  layout: z.string().optional(),
  layers: z.array(layerSchema).max(100),
});

export type SceneDocument = z.infer<typeof sceneDocumentSchema>;

/** A scene as the app handles it: the stored row plus its parsed document. */
export const sceneSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string().min(1).max(120),
  kind: z.enum(SCENE_KINDS),
  position: z.number().int(),
  revision: z.number().int().min(1),
  document: sceneDocumentSchema,
  updatedAt: z.string(),
});

export type Scene = z.infer<typeof sceneSchema>;

export function newLayerId(): string {
  return crypto.randomUUID();
}

type LayerInput<T extends Layer> = Omit<T, "id" | "motion" | "rotation" | "opacity" | "visible" | "locked"> &
  Partial<Pick<T, "id" | "motion" | "rotation" | "opacity" | "visible" | "locked">>;

/** Fills common defaults so presets and the editor build layers the same way. */
export function makeLayer<T extends Layer>(input: LayerInput<T>): T {
  return {
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    motion: defaultMotion(),
    ...input,
    id: input.id ?? newLayerId(),
  } as T;
}
