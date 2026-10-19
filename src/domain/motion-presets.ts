import { z } from "zod";
import { defaultMotion, motionConfigSchema, type MotionConfig } from "./motion";
import type { Layer } from "./scene";

/**
 * Reusable motion settings. Presets copy values onto a layer (no live link), so editing
 * or deleting a preset never changes layers it was applied to.
 */

export const PRESET_TARGETS = ["any", "text", "image", "logo"] as const;
export type PresetTarget = (typeof PRESET_TARGETS)[number];

export const motionPresetSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60),
  appliesTo: z.enum(PRESET_TARGETS).default("any"),
  /** Timing, entrance, camera motion and exit. Photo transitions are scene-specific and excluded. */
  motion: motionConfigSchema.omit({ transition: true }),
});

export type MotionPreset = z.infer<typeof motionPresetSchema>;

export const motionPresetListSchema = z.array(motionPresetSchema).max(100).catch([]);

function starter(id: string, name: string, appliesTo: PresetTarget, patch: (m: MotionConfig) => void): MotionPreset {
  const m = defaultMotion();
  patch(m);
  const { transition: _t, ...motion } = m;
  return { id: `starter:${id}`, name, appliesTo, motion };
}

/** Built-in starting points; always available, never stored. */
export const STARTER_PRESETS: MotionPreset[] = [
  starter("headline-fade-slide-up", "Headline — Fade In + Slide Up", "text", (m) => {
    m.delayMs = 300;
    m.entrance = { ...m.entrance, fade: true, move: "slideUp", durationMs: 700, easing: "easeOut", distance: 80 };
  }),
  starter("subtitle-delayed-fade", "Subtitle — Delayed Fade In", "text", (m) => {
    m.sequencing = "afterPrevious";
    m.delayMs = 150;
    m.entrance = { ...m.entrance, fade: true, move: "none", durationMs: 600, easing: "easeInOut" };
  }),
  starter("photo-slow-zoom-in", "Vehicle Photo — Slow Zoom In", "image", (m) => {
    m.continuous = {
      ...m.continuous,
      preset: "slowZoomIn",
      scaleStart: 1,
      scaleEnd: 1.08,
      durationMs: 0,
      easing: "linear",
    };
  }),
  starter("logo-fade-in", "Logo — Fade In", "logo", (m) => {
    m.delayMs = 200;
    m.entrance = { ...m.entrance, fade: true, move: "none", durationMs: 600, easing: "easeOut" };
  }),
];

export function presetTargetFor(layer: Layer): PresetTarget {
  return layer.type === "text" || layer.type === "image" || layer.type === "logo" ? layer.type : "any";
}

/** Motion from a layer, ready to save as a preset. */
export function presetMotionFrom(layer: Layer): MotionPreset["motion"] {
  const { transition: _t, ...motion } = layer.motion;
  return structuredClone(motion);
}

/**
 * Applies a preset to a layer. Camera motion only applies to photos/logos; a photo's
 * transition (Photo 1 → Photo 2) is left untouched.
 */
export function applyMotionPreset(layer: Layer, preset: MotionPreset): MotionConfig {
  const supportsCamera = layer.type === "image" || layer.type === "logo";
  return {
    ...structuredClone(preset.motion),
    continuous: supportsCamera ? structuredClone(preset.motion.continuous) : layer.motion.continuous,
    transition: layer.motion.transition,
  };
}
