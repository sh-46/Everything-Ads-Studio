import { fitImageRect, type Point, type Rect, type Size } from "./geometry";
import { hasEntrance, type Direction, type Easing, type MotionConfig } from "./motion";
import type { ImageLayer, Layer, LogoLayer } from "./scene";

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

/** Damped spring (ζ = 0.65): ~7% overshoot, settled well before t = 1. */
const SPRING_DAMPING = 0.65;
const SPRING_FREQUENCY = 12;
function spring(t: number): number {
  if (t >= 1) return 1;
  const zeta = SPRING_DAMPING;
  const omega = SPRING_FREQUENCY;
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(damped * t) + ((zeta * omega) / damped) * Math.sin(damped * t));
}

const EASING_FNS: Record<Easing, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  spring,
};

/** Eased progress. Spring may exceed 1 briefly (overshoot); all others stay in 0–1. */
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
  return hasEntrance(layer.motion.entrance) ? layer.motion.entrance.durationMs : 0;
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
  /** Image content transform inside its (clipped) frame, scaled about `contentOrigin`. */
  contentScale: number;
  contentTranslateX: number;
  contentTranslateY: number;
  /** Scale origin in frame pixels; null = the frame center (CSS `50% 50%`). */
  contentOrigin: Point | null;
}

export const IDENTITY_MOTION: MotionState = {
  opacity: 1,
  translateX: 0,
  translateY: 0,
  scale: 1,
  contentScale: 1,
  contentTranslateX: 0,
  contentTranslateY: 0,
  contentOrigin: null,
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
  const { fade, move, durationMs, easing, distance, scaleStart } = m.entrance;
  if (!fade && move === "none") {
    // No entrance animation: a cut at the start time.
    if (t < timing.start) state.opacity = 0;
    return;
  }
  const p = progress(t, timing.start, durationMs, easing);
  // Opacity never overshoots; movement may (Spring).
  if (fade) state.opacity *= Math.min(1, Math.max(0, p));
  else if (t < timing.start) state.opacity = 0;
  const remaining = 1 - p;
  switch (move) {
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
    case "none":
      break;
  }
}

/** Where the photo sits in its frame (static framing: fit, static zoom, static pan). */
export function imageRectInFrame(layer: ImageLayer, media: Size | null | undefined): Rect {
  const frame = { width: layer.width, height: layer.height };
  return fitImageRect(media ?? frame, frame, layer.fit, layer.focalX, layer.focalY, layer.zoom);
}

/**
 * The motion focus point in frame pixels, or null when none is set (frame center).
 * The point is stored relative to the image, so crop/fit/zoom changes move it with
 * the content it marks.
 */
export function focusInFrame(layer: Layer, media: Size | null | undefined): Point | null {
  if (layer.type !== "image" || !layer.motionFocus) return null;
  const rect = imageRectInFrame(layer, media);
  return { x: rect.x + layer.motionFocus.x * rect.width, y: rect.y + layer.motionFocus.y * rect.height };
}

/** Inverse of `focusInFrame`: a frame point → normalized image coordinates (clamped). */
export function focusFromFramePoint(layer: ImageLayer, media: Size | null | undefined, point: Point): Point {
  const rect = imageRectInFrame(layer, media);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp((point.x - rect.x) / rect.width), y: clamp((point.y - rect.y) / rect.height) };
}

/** Effective focus in image coordinates (the frame center when none is set). */
export function effectiveFocus(layer: ImageLayer, media: Size | null | undefined): Point {
  return layer.motionFocus ?? focusFromFramePoint(layer, media, { x: layer.width / 2, y: layer.height / 2 });
}

/**
 * Smallest scale about `origin` that keeps `rect` covering the frame while the content
 * is translated by up to ±`travel`/2 on one axis.
 */
function coverScaleAbout(rect: Rect, frame: Size, origin: Point, travelX: number, travelY: number): number {
  const need = (num: number, den: number) => (num <= 0 ? 1 : den <= 1e-6 ? 10 : num / den);
  return Math.max(
    need(origin.x + travelX / 2, origin.x - rect.x),
    need(frame.width - origin.x + travelX / 2, rect.x + rect.width - origin.x),
    need(origin.y + travelY / 2, origin.y - rect.y),
    need(frame.height - origin.y + travelY / 2, rect.y + rect.height - origin.y),
  );
}

function applyTransition(state: MotionState, m: MotionConfig, timing: LayerTiming, t: number, layer: Layer) {
  const { preset, durationMs, easing, direction } = m.transition;
  const p = progress(t, timing.start, durationMs, easing);
  switch (preset) {
    case "crossfade":
      state.opacity *= Math.min(1, Math.max(0, p));
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
      // Settles onto Photo 2's focus point when it has one (origin set by applyContinuous or below).
      state.contentScale *= 1 + 0.25 * (1 - p);
      state.opacity *= Math.min(1, Math.max(0, p));
      return;
    case "none":
      if (p <= 0) state.opacity = 0;
      return;
  }
}

function applyContinuous(
  state: MotionState,
  m: MotionConfig,
  timing: LayerTiming,
  t: number,
  layer: Layer,
  media: Size | null | undefined,
) {
  const { preset, scaleStart, scaleEnd, distance, easing } = m.continuous;
  if (preset === "none") return;
  const span = timing.continuousEnd - timing.continuousStart;
  const q = span <= 0 ? 1 : ease(easing, (t - timing.continuousStart) / span);
  const focus = focusInFrame(layer, media);
  if (preset === "slowZoomIn" || preset === "slowZoomOut") {
    // Zoom toward the focus point: it stays fixed on screen while everything scales about it.
    state.contentScale *= scaleStart + (scaleEnd - scaleStart) * q;
    if (focus) state.contentOrigin = focus;
    return;
  }
  const horizontal = preset === "panLeft" || preset === "panRight";
  const offset = distance / 2 - distance * q; // +d/2 → −d/2
  if (focus && layer.type === "image") {
    // Scale about the subject just enough that the pan never reveals an edge.
    const frame = { width: layer.width, height: layer.height };
    const rect = imageRectInFrame(layer, media);
    const needed = coverScaleAbout(rect, frame, focus, horizontal ? distance : 0, horizontal ? 0 : distance);
    state.contentScale *= Math.max(scaleStart, needed);
    state.contentOrigin = focus;
  } else {
    // Original behaviour: scale about the frame center by the travel distance.
    const frameSize = horizontal ? layer.width : layer.height;
    state.contentScale *= Math.max(scaleStart, 1 + distance / Math.max(1, frameSize));
  }
  if (preset === "panLeft") state.contentTranslateX += offset;
  if (preset === "panRight") state.contentTranslateX -= offset;
  if (preset === "panUp") state.contentTranslateY += offset;
  if (preset === "panDown") state.contentTranslateY -= offset;
}

function applyExit(state: MotionState, m: MotionConfig, timing: LayerTiming, t: number) {
  const { preset, easing, distance, direction } = m.exit;
  if (preset === "none" || t < timing.exitStart) return;
  const r = progress(t, timing.exitStart, timing.exitEnd - timing.exitStart, easing);
  state.opacity *= Math.min(1, Math.max(0, 1 - r));
  if (preset === "slideOut") {
    const [dx, dy] = directionVector(direction);
    state.translateX += dx * distance * r;
    state.translateY += dy * distance * r;
  }
}

/**
 * The layer's motion at time `t` (ms from scene start). `media` is the image's intrinsic
 * size; it's needed to place a motion focus point (static framing depends on it).
 */
export function evaluateMotion(
  layer: Layer,
  timing: LayerTiming | undefined,
  t: number,
  media?: Size | null,
): MotionState {
  const state = { ...IDENTITY_MOTION };
  if (!timing) return state;
  const m = layer.motion;
  if (usesTransition(layer)) applyTransition(state, m, timing, t, layer);
  else applyEntrance(state, m, timing, t);
  if (layer.type === "image" || layer.type === "logo") applyContinuous(state, m, timing, t, layer, media);
  // A zoom transition without camera motion also settles onto the focus point.
  if (!state.contentOrigin && state.contentScale !== 1) state.contentOrigin = focusInFrame(layer, media);
  applyExit(state, m, timing, t);
  return state;
}

/** Whether a layer type supports the continuous / transition sections. */
export function supportsContinuous(layer: Layer): boolean {
  return layer.type === "image" || layer.type === "logo";
}

export interface SceneTimingIssue {
  layerId: string;
  message: string;
}

/** Animation that runs past the end of the scene (it would be cut off). */
export function timingIssues(layer: Layer, timing: LayerTiming | undefined, sceneDurationMs: number): string[] {
  if (!timing) return [];
  const issues: string[] = [];
  const s = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
  if (timing.start >= sceneDurationMs)
    issues.push(`Starts at ${s(timing.start)}, after the scene ends (${s(sceneDurationMs)}).`);
  else if (timing.entranceEnd > sceneDurationMs)
    issues.push(`Entrance ends at ${s(timing.entranceEnd)}, after the scene ends.`);
  if (Number.isFinite(timing.exitEnd) && timing.exitEnd > sceneDurationMs + 1) {
    issues.push(`Exit ends at ${s(timing.exitEnd)}, after the scene ends.`);
  }
  if (layer.motion.continuous.preset !== "none" && timing.continuousEnd > sceneDurationMs + 1) {
    issues.push(`Camera motion runs to ${s(timing.continuousEnd)}; it will be cut at the scene end.`);
  }
  return issues;
}

/**
 * Checks whether animated camera motion ever exposes the frame's edges (blank areas).
 * Samples the continuous motion only — transitions and entrances move on purpose.
 * `minScaleNeeded` is the factor to multiply the camera scales by to stay covered.
 */
export function cameraCoverage(
  layer: ImageLayer | LogoLayer,
  media: Size | null,
  timing: LayerTiming | undefined,
): { covered: boolean; minScaleNeeded: number } {
  const m = layer.motion.continuous;
  if (!timing || m.preset === "none" || layer.type === "logo") return { covered: true, minScaleNeeded: 1 };
  const frame = { width: layer.width, height: layer.height };
  const rect = imageRectInFrame(layer, media);
  const cameraOnly = cameraOnlyLayer(layer);
  let worst = 1;
  for (const st of sampleCamera(cameraOnly, timing, media)) {
    const o = st.contentOrigin ?? { x: frame.width / 2, y: frame.height / 2 };
    const s = st.contentScale;
    const tx = st.contentTranslateX;
    const ty = st.contentTranslateY;
    // Factor k (applied to s) each edge needs; only edges that would show matter.
    const edge = (gap: number, reach: number) => (gap <= 0.5 ? 1 : reach <= 1e-6 ? 10 : (gap + reach) / reach);
    const left = o.x + (rect.x - o.x) * s + tx;
    const top = o.y + (rect.y - o.y) * s + ty;
    const right = o.x + (rect.x + rect.width - o.x) * s + tx;
    const bottom = o.y + (rect.y + rect.height - o.y) * s + ty;
    worst = Math.max(
      worst,
      edge(left, o.x + tx - left),
      edge(top, o.y + ty - top),
      edge(frame.width - right, right - (o.x + tx)),
      edge(frame.height - bottom, bottom - (o.y + ty)),
    );
  }
  return { covered: worst <= 1.0005, minScaleNeeded: worst };
}

function cameraOnlyLayer(layer: ImageLayer | LogoLayer): Layer {
  return {
    ...layer,
    motion: {
      ...layer.motion,
      entrance: { ...layer.motion.entrance, fade: false, move: "none" },
      transition: { ...layer.motion.transition, preset: "none" },
      exit: { ...layer.motion.exit, preset: "none" },
    },
    role: undefined,
  };
}

function sampleCamera(layer: Layer, timing: LayerTiming, media: Size | null | undefined, steps = 40): MotionState[] {
  const states: MotionState[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = timing.continuousStart + ((timing.continuousEnd - timing.continuousStart) * i) / steps;
    states.push(evaluateMotion(layer, { ...timing, start: 0, entranceEnd: 0 }, t, media));
  }
  return states;
}

/**
 * Framing assistance for a focus point: whether it starts outside the visible frame
 * (cropped away) or leaves the frame during the camera motion (e.g. a long pan).
 */
export function focusVisibility(
  layer: ImageLayer,
  media: Size | null,
  timing: LayerTiming | undefined,
): { outsideFrame: boolean; leavesFrame: boolean } {
  const focus = focusInFrame(layer, media);
  if (!focus || !timing) return { outsideFrame: false, leavesFrame: false };
  const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= layer.width && p.y <= layer.height;
  const outsideFrame = !inside(focus);
  let leavesFrame = false;
  for (const st of sampleCamera(cameraOnlyLayer(layer), timing, media)) {
    const o = st.contentOrigin ?? { x: layer.width / 2, y: layer.height / 2 };
    const p = {
      x: o.x + (focus.x - o.x) * st.contentScale + st.contentTranslateX,
      y: o.y + (focus.y - o.y) * st.contentScale + st.contentTranslateY,
    };
    if (!inside(p)) leavesFrame = true;
  }
  return { outsideFrame, leavesFrame: !outsideFrame && leavesFrame };
}

/**
 * What the camera shows at its most zoomed-in moment, in frame pixels (unzoomed
 * content coordinates). Used to draw a framing guide in the editor.
 */
export function zoomedFraming(layer: ImageLayer, media: Size | null): Rect | null {
  const c = layer.motion.continuous;
  if (c.preset !== "slowZoomIn" && c.preset !== "slowZoomOut") return null;
  const s = Math.max(c.scaleStart, c.scaleEnd);
  if (s <= 1) return null;
  const o = focusInFrame(layer, media) ?? { x: layer.width / 2, y: layer.height / 2 };
  return { x: o.x - o.x / s, y: o.y - o.y / s, width: layer.width / s, height: layer.height / s };
}
