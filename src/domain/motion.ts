import { z } from "zod";

/**
 * Motion configuration stored on every layer. Milestone 1 persists these values;
 * evaluation (frame → transform) and the motion inspector land in Phase 3.
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

export const SEQUENCING = ["sceneStart", "withPrevious", "afterPrevious"] as const;

export const easingSchema = z.enum(EASINGS);

export const motionConfigSchema = z.object({
  sequencing: z.enum(SEQUENCING).default("sceneStart"),
  delayMs: z.number().int().min(0).max(60_000).default(0),
  holdMs: z.number().int().min(0).max(60_000).default(0),
  entrance: z
    .object({
      preset: z.enum(ENTRANCE_PRESETS).default("none"),
      durationMs: z.number().int().min(0).max(20_000).default(600),
      easing: easingSchema.default("easeOutCubic"),
      distance: z.number().min(0).max(4000).default(80),
      scaleStart: z.number().min(0).max(10).default(0.9),
    })
    .prefault({}),
  continuous: z
    .object({
      preset: z.enum(CONTINUOUS_PRESETS).default("none"),
      scaleStart: z.number().min(0.1).max(10).default(1),
      scaleEnd: z.number().min(0.1).max(10).default(1.08),
      distance: z.number().min(0).max(4000).default(60),
    })
    .prefault({}),
  exit: z
    .object({
      preset: z.enum(EXIT_PRESETS).default("none"),
      durationMs: z.number().int().min(0).max(20_000).default(400),
      easing: easingSchema.default("easeInOut"),
      distance: z.number().min(0).max(4000).default(80),
    })
    .prefault({}),
});

export type MotionConfig = z.infer<typeof motionConfigSchema>;

export function defaultMotion(): MotionConfig {
  return motionConfigSchema.parse({});
}
