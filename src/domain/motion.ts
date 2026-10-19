import { z } from "zod";

/**
 * Motion configuration stored on every layer. Evaluation (time → transform) lives in
 * `motion-engine.ts` and is shared by the Remotion preview and the future MP4 renderer.
 * Every field has a default so documents saved before a field existed still parse.
 */

export const EASINGS = ["linear", "easeIn", "easeOut", "easeInOut", "easeOutCubic", "easeInOutCubic"] as const;

export const ENTRANCE_PRESETS = [
  "none",
  "fadeIn",
  "slideUp",
  "slideDown",
  "slideLeft",
  "slideRight",
  "scaleIn",
] as const;

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

/** Two-image transitions: how a photo appears over the photo beneath it. */
export const TRANSITION_PRESETS = ["none", "crossfade", "slide", "zoom"] as const;

export const DIRECTIONS = ["up", "down", "left", "right"] as const;

export const SEQUENCING = ["sceneStart", "withPrevious", "afterPrevious"] as const;

export const easingSchema = z.enum(EASINGS);
export type Easing = z.infer<typeof easingSchema>;
export type Direction = (typeof DIRECTIONS)[number];
export type EntrancePreset = (typeof ENTRANCE_PRESETS)[number];
export type ContinuousPreset = (typeof CONTINUOUS_PRESETS)[number];
export type ExitPreset = (typeof EXIT_PRESETS)[number];
export type TransitionPreset = (typeof TRANSITION_PRESETS)[number];
export type Sequencing = (typeof SEQUENCING)[number];

export const motionConfigSchema = z.object({
  /** How the start time is derived: scene start, with/after the layer directly below. */
  sequencing: z.enum(SEQUENCING).default("sceneStart"),
  delayMs: z.number().int().min(0).max(60_000).default(0),
  /** Time between entrance end and exit start. 0 = hold until the exit is due at scene end. */
  holdMs: z.number().int().min(0).max(60_000).default(0),
  entrance: z
    .object({
      preset: z.enum(ENTRANCE_PRESETS).default("none"),
      durationMs: z.number().int().min(0).max(20_000).default(600),
      easing: easingSchema.default("easeOutCubic"),
      /** Travel in scene pixels for slide presets. */
      distance: z.number().min(0).max(4000).default(80),
      /** Starting scale for Scale In (ends at 1). */
      scaleStart: z.number().min(0).max(10).default(0.9),
    })
    .prefault({}),
  /** Continuous motion of an image inside its frame (Ken Burns style). */
  continuous: z
    .object({
      preset: z.enum(CONTINUOUS_PRESETS).default("none"),
      scaleStart: z.number().min(0.1).max(10).default(1),
      scaleEnd: z.number().min(0.1).max(10).default(1.08),
      distance: z.number().min(0).max(4000).default(60),
      /** 0 = runs from the layer's start until the end of the scene. */
      durationMs: z.number().int().min(0).max(120_000).default(0),
    })
    .prefault({}),
  /** Two-image transition; replaces the entrance for image layers when set. */
  transition: z
    .object({
      preset: z.enum(TRANSITION_PRESETS).default("none"),
      durationMs: z.number().int().min(0).max(20_000).default(800),
      easing: easingSchema.default("easeInOutCubic"),
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

export function defaultMotion(): MotionConfig {
  return motionConfigSchema.parse({});
}

export const ENTRANCE_LABELS: Record<EntrancePreset, string> = {
  none: "None",
  fadeIn: "Fade In",
  slideUp: "Slide Up",
  slideDown: "Slide Down",
  slideLeft: "Slide Left",
  slideRight: "Slide Right",
  scaleIn: "Scale In",
};

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
  none: "None",
  crossfade: "Crossfade",
  slide: "Slide",
  zoom: "Zoom",
};

export const EASING_LABELS: Record<Easing, string> = {
  linear: "Linear",
  easeIn: "Ease In",
  easeOut: "Ease Out",
  easeInOut: "Ease In-Out",
  easeOutCubic: "Smooth Out",
  easeInOutCubic: "Smooth In-Out",
};

export const SEQUENCING_LABELS: Record<Sequencing, string> = {
  sceneStart: "On scene start",
  withPrevious: "With previous",
  afterPrevious: "After previous",
};
