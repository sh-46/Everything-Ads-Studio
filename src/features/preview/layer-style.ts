import type { CSSProperties } from "react";
import { hexToRgba } from "@/domain/color";
import { fontStack } from "@/domain/fonts";
import { fitImageRect, type Rect } from "@/domain/geometry";
import type { GradientFill } from "@/domain/gradient";
import type { MotionState } from "@/domain/motion-engine";
import type { ImageFit, Layer, TextLayer } from "@/domain/scene";

/**
 * DOM/CSS styles for the Remotion composition. Every value is derived from the same
 * domain functions the Konva editor uses (geometry, gradient semantics, font stack), so
 * the two renderers agree by construction; `layer-style.test.ts` pins the equivalences.
 */

/** Layer box transform: motion translate → rotation about the top-left → scale about the center. */
export function layerTransform(layer: Pick<Layer, "width" | "height" | "rotation">, m: MotionState): string {
  const parts: string[] = [];
  if (m.translateX || m.translateY) parts.push(`translate(${m.translateX}px, ${m.translateY}px)`);
  if (layer.rotation) parts.push(`rotate(${layer.rotation}deg)`);
  if (m.scale !== 1) {
    const cx = layer.width / 2;
    const cy = layer.height / 2;
    parts.push(`translate(${cx}px, ${cy}px) scale(${m.scale}) translate(${-cx}px, ${-cy}px)`);
  }
  return parts.join(" ") || "none";
}

/** Image content transform inside its frame (pan/zoom/transition), about the frame center. */
export function contentTransform(m: MotionState): string {
  const parts: string[] = [];
  if (m.contentTranslateX || m.contentTranslateY)
    parts.push(`translate(${m.contentTranslateX}px, ${m.contentTranslateY}px)`);
  if (m.contentScale !== 1) parts.push(`scale(${m.contentScale})`);
  return parts.join(" ") || "none";
}

/** CSS equivalent of the Konva gradient fill (same angle semantics and radius). */
export function gradientCss(fill: GradientFill): string {
  const stops = [...fill.stops]
    .sort((a, b) => a.offset - b.offset)
    .map((s) => `${hexToRgba(s.color, s.opacity)} ${Number((s.offset * 100).toFixed(3))}%`)
    .join(", ");
  return fill.gradientType === "radial"
    ? `radial-gradient(circle farthest-corner at center, ${stops})`
    : `linear-gradient(${fill.angle}deg, ${stops})`;
}

export function textStyle(layer: TextLayer): CSSProperties {
  return {
    width: layer.width,
    margin: 0,
    fontFamily: fontStack(layer.fontFamily),
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    letterSpacing: layer.letterSpacing,
    lineHeight: layer.lineHeight,
    color: layer.color,
    textAlign: layer.align,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    fontKerning: "normal",
  };
}

/** Where the full image sits in its frame — identical to the Konva crop math. */
export function imageRect(
  media: { width: number | null; height: number | null },
  frame: { width: number; height: number },
  fit: ImageFit,
  focalX: number,
  focalY: number,
  zoom: number,
): Rect {
  const size = media.width && media.height ? { width: media.width, height: media.height } : frame;
  return fitImageRect(size, frame, fit, focalX, focalY, zoom);
}

/** Konva clamps corner radius to half the shorter side; CSS needs the same clamp. */
export function cornerRadius(layer: { width: number; height: number; cornerRadius: number }): number {
  return Math.min(layer.cornerRadius, layer.width / 2, layer.height / 2);
}
