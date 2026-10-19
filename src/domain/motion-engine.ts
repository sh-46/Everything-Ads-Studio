import type { Direction, Easing, MotionConfig } from "./motion";
import type { Layer } from "./scene";

/**
 * Deterministic, frame-based motion evaluation. Given a scene's layers and a time, it
 * returns the transform for each layer. The Remotion preview uses it today and the
 * Phase 4 MP4 renderer will use the same function, so preview and export match.
 *
 * Times are milliseconds from scene start. Convert frames with `frameToMs`.
 */

export const PREVIEW_FPS = 30;

export function frameToMs(frame: number, fps: number): number {
  return (frame / fps) * 1000;
}

export function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

const EASING_FNS: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => 1 - (1 - t) * (1 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export function ease(easing: Easing, t: number): number {
  return EASING_FNS[easing](clamp01(t));
}

function clamp01(t: number): number {
  return Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : t > 0 ? 1 : 0;
}

/** 0 before `start`, 1 after `start + duration`, eased in between. Zero duration is a cut. */
function progress(t: number, start: number, duration: number, easing: Easing): number {
  if (duration <= 0) return t >= start ? 1 : 0;
  return ease(easing, (t - start) / duration);
}

export interface LayerTiming {
  /** When the layer's entrance (or cut-in) begins. */
  start: number;
  entranceEnd: number;
  exitStart: number;
  exitEnd: number;
  continuousStart: number;
  continuousEnd: number;
}

function usesTransition(layer: Layer): boolean {
  return layer.type === "image" && layer.motion.transition.preset !== "none";
}

function entranceDuration(layer: Layer): number {
  if (usesTransition(layer)) return layer.motion.transition.durationMs;
  return layer.motion.entrance.preset === "none" ? 0 : layer.motion.entrance.durationMs;
}

/**
 * Resolves start/end times. "Previous" is the nearest visible layer below in the stack
 * (the next row down in the Layers panel). Hidden layers don't take part in sequencing.
 */
export function computeSceneTimings(layers: Layer[], sceneDurationMs: number): Map<string, LayerTiming> {
  const timings = new Map<string, LayerTiming>();
  let previous: LayerTiming | null = null;
  for (const layer of layers) {
    if (!layer.visible) continue;
    const m = layer.motion;
    const base =
      m.sequencing === "withPrevious" && previous
        ? previous.start
        : m.sequencing === "afterPrevious" && previous
          ? previous.entranceEnd
          : 0;
    const start = base + m.delayMs;
    const entranceEnd = start + entranceDuration(layer);

    let exitStart = Infinity;
    let exitEnd = Infinity;
    if (m.exit.preset !== "none") {
      exitStart = m.holdMs > 0 ? entranceEnd + m.holdMs : sceneDurationMs - m.exit.durationMs;
      exitStart = Math.max(entranceEnd, exitStart);
      exitEnd = exitStart + m.exit.durationMs;
    }

    const continuousEnd = m.continuous.durationMs > 0 ? start + m.continuous.durationMs : sceneDurationMs;
    const timing: LayerTiming = {
      start,
      entranceEnd,
      exitStart,
      exitEnd,
      continuousStart: start,
      continuousEnd: Math.max(start, continuousEnd),
    };
    timings.set(layer.id, timing);
    previous = timing;
  }
  return timings;
}

export interface MotionState {
  /** Multiplies the layer's own opacity. */
  opacity: number;
  /** Layer translation in scene pixels. */
  translateX: number;
  translateY: number;
  /** Layer scale around its center. */
  scale: number;
  /** Image content transform inside its (clipped) frame, around the frame center. */
  contentScale: number;
  contentTranslateX: number;
  contentTranslateY: number;
}

export const IDENTITY_MOTION: MotionState = {
  opacity: 1,
  translateX: 0,
  translateY: 0,
  scale: 1,
  contentScale: 1,
  contentTranslateX: 0,
  contentTranslateY: 0,
};

function directionVector(direction: Direction): [number, number] {
  switch (direction) {
    case "up":
      return [0, -1];
    case "down":
      return [0, 1];
    case "left":
      return [-1, 0];
    case "right":
      return [1, 0];
  }
}

function applyEntrance(state: MotionState, m: MotionConfig, timing: LayerTiming, t: number) {
  const { preset, durationMs, easing, distance, scaleStart } = m.entrance;
  const p = progress(t, timing.start, preset === "none" ? 0 : durationMs, easing);
  const remaining = 1 - p;
  switch (preset) {
    case "none":
      state.opacity *= p; // a cut at the start time
      return;
    case "fadeIn":
      state.opacity *= p;
      return;
    case "slideUp":
      state.translateY += distance * remaining;
      break;
    case "slideDown":
      state.translateY -= distance * remaining;
      break;
    case "slideLeft":
      state.translateX += distance * remaining;
      break;
    case "slideRight":
      state.translateX -= distance * remaining;
      break;
    case "scaleIn":
      state.scale *= scaleStart + (1 - scaleStart) * p;
      break;
  }
  state.opacity *= p;
}

function applyTransition(state: MotionState, m: MotionConfig, timing: LayerTiming, t: number, layer: Layer) {
  const { preset, durationMs, easing, direction } = m.transition;
  const p = progress(t, timing.start, durationMs, easing);
  switch (preset) {
    case "crossfade":
      state.opacity *= p;
      return;
    case "slide": {
      // The new photo travels in from the opposite edge, moving in `direction`.
      const [dx, dy] = directionVector(direction);
      state.contentTranslateX -= dx * layer.width * (1 - p);
      state.contentTranslateY -= dy * layer.height * (1 - p);
      if (p <= 0) state.opacity = 0;
      return;
    }
    case "zoom":
      state.contentScale *= 1 + 0.25 * (1 - p);
      state.opacity *= p;
      return;
    case "none":
      return;
  }
}

function applyContinuous(state: MotionState, m: MotionConfig, timing: LayerTiming, t: number, layer: Layer) {
  const { preset, scaleStart, scaleEnd, distance } = m.continuous;
  if (preset === "none") return;
  const span = timing.continuousEnd - timing.continuousStart;
  const q = span <= 0 ? 1 : clamp01((t - timing.continuousStart) / span);
  if (preset === "slowZoomIn" || preset === "slowZoomOut") {
    state.contentScale *= scaleStart + (scaleEnd - scaleStart) * q;
    return;
  }
  // Pans scale the image just enough that its edges never come into view.
  const horizontal = preset === "panLeft" || preset === "panRight";
  const frameSize = horizontal ? layer.width : layer.height;
  state.contentScale *= Math.max(scaleStart, 1 + distance / Math.max(1, frameSize));
  const offset = distance / 2 - distance * q; // +d/2 → −d/2
  if (preset === "panLeft") state.contentTranslateX += offset;
  if (preset === "panRight") state.contentTranslateX -= offset;
  if (preset === "panUp") state.contentTranslateY += offset;
  if (preset === "panDown") state.contentTranslateY -= offset;
}

function applyExit(state: MotionState, m: MotionConfig, timing: LayerTiming, t: number) {
  const { preset, easing, distance, direction } = m.exit;
  if (preset === "none" || t < timing.exitStart) return;
  const r = progress(t, timing.exitStart, timing.exitEnd - timing.exitStart, easing);
  state.opacity *= 1 - r;
  if (preset === "slideOut") {
    const [dx, dy] = directionVector(direction);
    state.translateX += dx * distance * r;
    state.translateY += dy * distance * r;
  }
}

/** The layer's motion at time `t` (ms from scene start). */
export function evaluateMotion(layer: Layer, timing: LayerTiming | undefined, t: number): MotionState {
  const state = { ...IDENTITY_MOTION };
  if (!timing) return state;
  const m = layer.motion;
  if (usesTransition(layer)) applyTransition(state, m, timing, t, layer);
  else applyEntrance(state, m, timing, t);
  if (layer.type === "image" || layer.type === "logo") applyContinuous(state, m, timing, t, layer);
  applyExit(state, m, timing, t);
  return state;
}

/** Whether a layer type supports the continuous / transition sections. */
export function supportsContinuous(layer: Layer): boolean {
  return layer.type === "image" || layer.type === "logo";
}
