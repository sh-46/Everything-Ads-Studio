import { z } from "zod";

/**
 * Motion configuration stored on every layer. Evaluation (time → transform) lives in
 * `motion-engine.ts` and is shared by the Remotion preview and the future MP4 renderer.
 * Every field has a default, and older shapes are migrated on parse, so documents saved
 * by earlier versions keep animating exactly as before.
 */

/** Ease In/Out/In Out are cubic curves; Spring settles with a slight overshoot. */
export const EASINGS = ["linear", "easeIn", "easeOut", "easeInOut", "spring"] as const;

/** Names used before the easing audit. They were already cubic, so the mapping is exact. */
const LEGACY_EASINGS: Record<string, (typeof EASINGS)[number]> = {
  easeOutCubic: "easeOut",
  easeInOutCubic: "easeInOut",
};

/** Entrance movement, combinable with a fade. */
export const ENTRANCE_MOVES = ["none", "slideUp", "slideDown", "slideLeft", "slideRight", "scaleIn"] as const;

export const CONTINUOUS_PRESETS = [
  "none",
  "slowZoomIn",
  "slowZoomOut",
  "panLeft",
  "panRight",
  "panUp",
  "panDown",
] as const;

export const EXIT_PRESETS = ["none", "fadeOut", "slideOut"] as const;

/** Photo 1 → Photo 2 transitions. "none" is a hard cut at the start time. */
export const TRANSITION_PRESETS = ["none", "crossfade", "slide", "zoom"] as const;

export const DIRECTIONS = ["up", "down", "left", "right"] as const;

export const SEQUENCING = ["sceneStart", "withPrevious", "afterPrevious"] as const;

export const easingSchema = z.preprocess(
  (value) => (typeof value === "string" && value in LEGACY_EASINGS ? LEGACY_EASINGS[value] : value),
  z.enum(EASINGS),
);
export type Easing = (typeof EASINGS)[number];
export type Direction = (typeof DIRECTIONS)[number];
export type EntranceMove = (typeof ENTRANCE_MOVES)[number];
export type ContinuousPreset = (typeof CONTINUOUS_PRESETS)[number];
export type ExitPreset = (typeof EXIT_PRESETS)[number];
export type TransitionPreset = (typeof TRANSITION_PRESETS)[number];
export type Sequencing = (typeof SEQUENCING)[number];

/**
 * Before entrance animations became combinable, a single `preset` was stored and every
 * slide/scale preset also faded. Map it onto { fade, move } with identical behaviour.
 */
export function migrateEntrance(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("preset" in value)) return value;
  const { preset, ...rest } = value as Record<string, unknown>;
  if ("fade" in rest || "move" in rest) return rest;
  if (preset === "fadeIn") return { ...rest, fade: true, move: "none" };
  if (typeof preset === "string" && (ENTRANCE_MOVES as readonly string[]).includes(preset) && preset !== "none") {
    return { ...rest, fade: true, move: preset };
  }
  return { ...rest, fade: false, move: "none" };
}

export const entranceSchema = z.preprocess(
  migrateEntrance,
  z.object({
    fade: z.boolean().default(false),
    move: z.enum(ENTRANCE_MOVES).default("none"),
    durationMs: z.number().int().min(0).max(20_000).default(600),
    easing: easingSchema.default("easeOut"),
    /** Travel in scene pixels for slides. */
    distance: z.number().min(0).max(4000).default(80),
    /** Starting scale for Scale In (ends at 1). */
    scaleStart: z.number().min(0).max(10).default(0.9),
  }),
);

export const motionConfigSchema = z.object({
  /**
   * Static / No Motion: the layer never animates — no entrance, camera motion,
   * transition or exit, and no easing. When it is on screen is controlled separately
   * by the layer's visibility timing. Other motion settings are kept, so turning it
   * off restores them.
   */
  static: z.boolean().default(false),
  /** How the start time is derived: scene start, with/after the layer directly below. */
  sequencing: z.enum(SEQUENCING).default("sceneStart"),
  delayMs: z.number().int().min(0).max(60_000).default(0),
  /** Time between entrance end and exit start. 0 = hold until the exit is due at scene end. */
  holdMs: z.number().int().min(0).max(60_000).default(0),
  entrance: entranceSchema.prefault({}),
  /** Animated camera motion of an image inside its frame (separate from static framing). */
  continuous: z
    .object({
      preset: z.enum(CONTINUOUS_PRESETS).default("none"),
      scaleStart: z.number().min(0.1).max(10).default(1),
      scaleEnd: z.number().min(0.1).max(10).default(1.08),
      distance: z.number().min(0).max(4000).default(60),
      /** 0 = runs from the layer's start until the end of the scene. */
      durationMs: z.number().int().min(0).max(120_000).default(0),
      easing: easingSchema.default("linear"),
    })
    .prefault({}),
  /** Photo 1 → Photo 2 transition, stored on Photo 2 (it replaces Photo 2's entrance). */
  transition: z
    .object({
      preset: z.enum(TRANSITION_PRESETS).default("none"),
      durationMs: z.number().int().min(0).max(20_000).default(800),
      easing: easingSchema.default("easeInOut"),
      direction: z.enum(DIRECTIONS).default("left"),
    })
    .prefault({}),
  exit: z
    .object({
      preset: z.enum(EXIT_PRESETS).default("none"),
      durationMs: z.number().int().min(0).max(20_000).default(400),
      easing: easingSchema.default("easeInOut"),
      distance: z.number().min(0).max(4000).default(80),
      direction: z.enum(DIRECTIONS).default("up"),
    })
    .prefault({}),
});

export type MotionConfig = z.infer<typeof motionConfigSchema>;
export type EntranceConfig = MotionConfig["entrance"];

export function defaultMotion(): MotionConfig {
  return motionConfigSchema.parse({});
}

/** Motion for layers that must not move (e.g. disclosures). */
export function staticMotion(): MotionConfig {
  return { ...defaultMotion(), static: true };
}

export function hasEntrance(entrance: EntranceConfig): boolean {
  return entrance.fade || entrance.move !== "none";
}

export const MOVE_LABELS: Record<EntranceMove, string> = {
  none: "No movement",
  slideUp: "Slide Up",
  slideDown: "Slide Down",
  slideLeft: "Slide Left",
  slideRight: "Slide Right",
  scaleIn: "Scale In",
};

/** "Fade In + Slide Up", "Slide Up", "Fade In" or "None". */
export function entranceLabel(entrance: Pick<EntranceConfig, "fade" | "move">): string {
  const parts = [entrance.fade && "Fade In", entrance.move !== "none" && MOVE_LABELS[entrance.move]].filter(Boolean);
  return parts.length ? parts.join(" + ") : "None";
}

export const CONTINUOUS_LABELS: Record<ContinuousPreset, string> = {
  none: "None",
  slowZoomIn: "Slow Zoom In",
  slowZoomOut: "Slow Zoom Out",
  panLeft: "Pan Left",
  panRight: "Pan Right",
  panUp: "Pan Up",
  panDown: "Pan Down",
};

export const EXIT_LABELS: Record<ExitPreset, string> = { none: "None", fadeOut: "Fade Out", slideOut: "Slide Out" };

export const TRANSITION_LABELS: Record<TransitionPreset, string> = {
  none: "Cut",
  crossfade: "Crossfade",
  slide: "Slide",
  zoom: "Zoom",
};

export const EASING_LABELS: Record<Easing, string> = {
  linear: "Linear",
  easeIn: "Ease In",
  easeOut: "Ease Out",
  easeInOut: "Ease In Out (Easy Ease)",
  spring: "Spring",
};

export const SEQUENCING_LABELS: Record<Sequencing, string> = {
  sceneStart: "On scene start",
  withPrevious: "With previous layer",
  afterPrevious: "After previous layer",
};
