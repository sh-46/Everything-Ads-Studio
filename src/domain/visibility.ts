import type { LayerTiming } from "./motion-engine";
import type { ImageLayer, Layer, SceneDocument } from "./scene";
import { photoPair } from "./scene-photos";

/**
 * Layer visibility timing — *when* a layer is on screen — kept separate from its motion
 * (*how* it moves). A layer outside its window isn't drawn at all; inside it, motion
 * applies as usual (static layers simply don't move).
 */

export interface VisibilityWindow {
  /** ms from scene start (inclusive). */
  from: number;
  /** ms (exclusive); Infinity = until the scene ends. */
  to: number;
}

export const ALWAYS: VisibilityWindow = { from: 0, to: Infinity };
const NEVER: VisibilityWindow = { from: 0, to: 0 };

export function isVisibleAt(window: VisibilityWindow | undefined, t: number): boolean {
  return !window || (t >= window.from && t < window.to);
}

/**
 * When a photo is on screen. In a Photo 1 → Photo 2 transition both photos show for a
 * moment; the hand-over happens at the middle of the transition (a cut at its start),
 * so each photo's disclosure is shown while that photo dominates and the two disclosures
 * never overlap.
 */
export function photoWindow(
  doc: SceneDocument,
  imageLayerId: string,
  timings: Map<string, LayerTiming>,
): VisibilityWindow {
  const image = doc.layers.find((l): l is ImageLayer => l.id === imageLayerId && l.type === "image");
  const timing = image ? timings.get(image.id) : undefined;
  if (!image || !image.visible || image.opacity <= 0 || !timing) return NEVER;
  const handOver = (layer: ImageLayer, t: LayerTiming) =>
    layer.motion.static || layer.motion.transition.preset === "none"
      ? t.start
      : t.start + layer.motion.transition.durationMs / 2;

  const { photo1, photo2 } = photoPair(doc);
  let from = image.motion.static ? 0 : timing.start;
  let to = image.motion.static || !Number.isFinite(timing.exitEnd) ? Infinity : timing.exitEnd;
  if (photo2 && image.id === photo2.id) from = handOver(photo2, timing);
  if (photo1 && photo2 && image.id === photo1.id && photo2.visible && photo2.opacity > 0) {
    const t2 = timings.get(photo2.id);
    if (t2) to = Math.min(to, handOver(photo2, t2));
  }
  return to > from ? { from, to } : NEVER;
}

export function layerWindow(doc: SceneDocument, layer: Layer, timings: Map<string, LayerTiming>): VisibilityWindow {
  const v = layer.visibility;
  if (v.mode === "range") return { from: v.startMs, to: v.endMs ?? Infinity };
  if (v.mode === "linkedPhoto") {
    const imageLayerId = layer.type === "text" ? layer.disclosure?.imageLayerId : undefined;
    return imageLayerId ? photoWindow(doc, imageLayerId, timings) : NEVER;
  }
  return ALWAYS;
}

/** Visibility window per layer id (layers set to "always" are omitted). */
export function computeVisibility(
  doc: SceneDocument,
  timings: Map<string, LayerTiming>,
): Map<string, VisibilityWindow> {
  const windows = new Map<string, VisibilityWindow>();
  for (const layer of doc.layers) {
    if (layer.visibility.mode !== "always") windows.set(layer.id, layerWindow(doc, layer, timings));
  }
  return windows;
}

/**
 * Layers left out of the static, fully-entered layout (editor canvas default, CTA PNG):
 * only one photo of a transition pair is visible there (Photo 2, on top), so only its
 * linked layers are shown.
 */
export function hiddenInStaticLayout(doc: SceneDocument): Set<string> {
  const hidden = new Set<string>();
  const { photo1, photo2 } = photoPair(doc);
  if (!photo1 || !photo2 || !photo2.visible) return hidden;
  for (const layer of doc.layers) {
    if (
      layer.visibility.mode === "linkedPhoto" &&
      layer.type === "text" &&
      layer.disclosure?.imageLayerId === photo1.id
    ) {
      hidden.add(layer.id);
    }
  }
  return hidden;
}
