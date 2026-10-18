import type { ImageFit } from "./scene";

/**
 * Renderer-agnostic geometry. Konva (editor) and Remotion (preview/export) must both
 * derive pixels from these functions instead of their own layout rules.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Where the whole image sits relative to the frame's top-left, before clipping.
 * Matches CSS `object-fit` + `object-position: {focalX*100}% {focalY*100}%`,
 * with `zoom` scaling the fitted size.
 */
export function fitImageRect(image: Size, frame: Size, fit: ImageFit, focalX: number, focalY: number, zoom = 1): Rect {
  let width: number;
  let height: number;
  if (fit === "fill") {
    width = frame.width * zoom;
    height = frame.height * zoom;
  } else {
    const ratio =
      fit === "cover"
        ? Math.max(frame.width / image.width, frame.height / image.height)
        : Math.min(frame.width / image.width, frame.height / image.height);
    width = image.width * ratio * zoom;
    height = image.height * ratio * zoom;
  }
  return {
    x: (frame.width - width) * focalX,
    y: (frame.height - height) * focalY,
    width,
    height,
  };
}

export interface VisibleImageRegion {
  /** Region of the source image, in source pixels. */
  source: Rect;
  /** Where that region is drawn, relative to the frame's top-left. */
  dest: Rect;
}

/**
 * The part of the fitted image that falls inside the frame — equivalent to drawing
 * the fitted image clipped to the frame. Returns null when nothing is visible.
 */
export function visibleImageRegion(
  image: Size,
  frame: Size,
  fit: ImageFit,
  focalX: number,
  focalY: number,
  zoom = 1,
): VisibleImageRegion | null {
  const placed = fitImageRect(image, frame, fit, focalX, focalY, zoom);
  const left = Math.max(0, placed.x);
  const top = Math.max(0, placed.y);
  const right = Math.min(frame.width, placed.x + placed.width);
  const bottom = Math.min(frame.height, placed.y + placed.height);
  if (right <= left || bottom <= top) return null;

  const scaleX = image.width / placed.width;
  const scaleY = image.height / placed.height;
  return {
    source: {
      x: (left - placed.x) * scaleX,
      y: (top - placed.y) * scaleY,
      width: (right - left) * scaleX,
      height: (bottom - top) * scaleY,
    },
    dest: { x: left, y: top, width: right - left, height: bottom - top },
  };
}

/**
 * Start/end points of a CSS `linear-gradient(<angle>deg, …)` inside a box.
 * The gradient line passes through the center and is long enough that the corners
 * receive the first/last stop colors (CSS Images Level 3 §3.1.1).
 */
export function linearGradientPoints(angleDeg: number, box: Size): { start: Point; end: Point } {
  const rad = (angleDeg * Math.PI) / 180;
  const dirX = Math.sin(rad);
  const dirY = -Math.cos(rad);
  const length = Math.abs(box.width * dirX) + Math.abs(box.height * dirY);
  const cx = box.width / 2;
  const cy = box.height / 2;
  const half = length / 2;
  return {
    start: { x: cx - dirX * half, y: cy - dirY * half },
    end: { x: cx + dirX * half, y: cy + dirY * half },
  };
}

/** Radius of `radial-gradient(circle farthest-corner at center)`. */
export function radialGradientRadius(box: Size): number {
  return Math.hypot(box.width / 2, box.height / 2);
}

/** Uniform scale that fits a scene inside a viewport with padding. */
export function fitScale(scene: Size, viewport: Size, padding = 48): number {
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  return Math.min(availableWidth / scene.width, availableHeight / scene.height);
}
