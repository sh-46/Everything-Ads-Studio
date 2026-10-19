import type { BrandKit } from "./brand-kit";
import { defaultMotion, type MotionConfig, type Sequencing } from "./motion";

/**
 * Brand Kit motion defaults, copied onto layers when they are created. Copying (not
 * referencing) means later Brand Kit edits never change existing scenes.
 */

export function textMotion(kit: BrandKit, sequencing: Sequencing = "sceneStart", delayMs = 0): MotionConfig {
  const m = defaultMotion();
  m.sequencing = sequencing;
  m.delayMs = delayMs;
  m.entrance = {
    ...m.entrance,
    preset: kit.motionDefaults.entrancePreset,
    durationMs: kit.motionDefaults.entranceDurationMs,
    easing: kit.motionDefaults.easing,
  };
  return m;
}

export function photoMotion(kit: BrandKit): MotionConfig {
  const m = defaultMotion();
  m.continuous = { ...m.continuous, ...continuousDefaults(kit.motionDefaults.photoMotion) };
  return m;
}

/** Sensible parameters when a continuous preset is chosen. */
export function continuousDefaults(preset: MotionConfig["continuous"]["preset"]): Partial<MotionConfig["continuous"]> {
  switch (preset) {
    case "slowZoomIn":
      return { preset, scaleStart: 1, scaleEnd: 1.08 };
    case "slowZoomOut":
      return { preset, scaleStart: 1.08, scaleEnd: 1 };
    case "none":
      return { preset };
    default:
      return { preset, scaleStart: 1, distance: 60 };
  }
}
