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
    fade: kit.motionDefaults.entranceFade,
    move: kit.motionDefaults.entranceMove,
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

/** What "Reset to default" restores for each Motion inspector section. */
export function sectionDefaults(kit: BrandKit, layerType: string) {
  const base = defaultMotion();
  const usesKitEntrance = layerType !== "image" && layerType !== "gradient";
  return {
    timing: { sequencing: base.sequencing, delayMs: base.delayMs },
    entrance: usesKitEntrance ? textMotion(kit).entrance : base.entrance,
    continuous: { ...base.continuous, ...continuousDefaults(kit.motionDefaults.photoMotion) },
    transition: { ...base.transition, preset: "crossfade" as const },
    exit: { ...base.exit },
    holdMs: base.holdMs,
  };
}
