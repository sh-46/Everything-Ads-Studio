import type { BrandKit } from "./brand-kit";
import { photoMotion } from "./brand-motion";
import { makeLayer, type ImageLayer, type Layer, type SceneDocument } from "./scene";

/**
 * Scene photo slots used by the Scenes Overview: slot 1 is the main photo, slot 2 the
 * optional second photo (shown with a two-image transition). Assigning changes only
 * `assetId` on an existing frame, so layout, crop, rotation and motion are preserved.
 */

export type PhotoSlot = 1 | 2;
export const MAX_SCENE_PHOTOS = 2;

function isImage(layer: Layer): layer is ImageLayer {
  return layer.type === "image";
}

export function scenePhotoLayers(doc: SceneDocument): { slot1?: ImageLayer; slot2?: ImageLayer } {
  const images = doc.layers.filter(isImage);
  const slot1 = images.find((l) => l.role === "primaryImage") ?? images.find((l) => l.role !== "secondaryImage");
  const slot2 = images.find((l) => l.role === "secondaryImage") ?? images.find((l) => l !== slot1);
  return { slot1, slot2 };
}

/** Asset ids shown on a scene card, in slot order. */
export function sceneAssetIds(doc: SceneDocument): (string | null)[] {
  const { slot1, slot2 } = scenePhotoLayers(doc);
  return [slot1?.assetId ?? null, slot2?.assetId ?? null];
}

export function assignScenePhoto(
  doc: SceneDocument,
  slot: PhotoSlot,
  assetId: string | null,
  kit: BrandKit,
): SceneDocument {
  const { slot1, slot2 } = scenePhotoLayers(doc);
  const target = slot === 1 ? slot1 : slot2;

  if (target) {
    return {
      ...doc,
      layers: doc.layers.map((l) => (l.id === target.id ? ({ ...l, assetId } as ImageLayer) : l)),
    };
  }
  if (assetId === null) return doc;

  if (slot === 1) {
    // No frame yet (e.g. the graphic-only CTA): add a full-bleed photo at the bottom.
    const layer = makeLayer<ImageLayer>({
      type: "image",
      name: "Photo",
      role: "primaryImage",
      assetId,
      fit: "cover",
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
      x: 0,
      y: 0,
      width: doc.width,
      height: doc.height,
      motion: photoMotion(kit),
    });
    return { ...doc, layers: [layer, ...doc.layers] };
  }

  // Second photo: same frame as photo 1, directly above it, crossfading in mid-scene.
  const frame = slot1 ?? { x: 0, y: 0, width: doc.width, height: doc.height, rotation: 0 };
  const layer = makeLayer<ImageLayer>({
    type: "image",
    name: "Photo 2",
    role: "secondaryImage",
    assetId,
    fit: "cover",
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    rotation: frame.rotation,
    motion: {
      ...photoMotion(kit),
      delayMs: Math.round(doc.durationMs * 0.45),
      transition: { preset: "crossfade", durationMs: 800, easing: "easeInOutCubic", direction: "left" },
    },
  });
  const index = slot1 ? doc.layers.findIndex((l) => l.id === slot1.id) + 1 : 0;
  const layers = [...doc.layers];
  layers.splice(index, 0, layer);
  return { ...doc, layers };
}

/** Ids of photo/logo assets referenced anywhere in the given documents. */
export function referencedAssetIds(docs: SceneDocument[]): Set<string> {
  const ids = new Set<string>();
  for (const doc of docs) {
    for (const layer of doc.layers) {
      if ((layer.type === "image" || layer.type === "logo") && layer.assetId) ids.add(layer.assetId);
    }
  }
  return ids;
}

/**
 * A frame for a newly placed photo or logo that keeps the file's aspect ratio, fits
 * within `maxFraction` of the scene, and is centered (or centered on `at`).
 */
export function aspectFrame(
  scene: { width: number; height: number },
  media: { width: number | null; height: number | null },
  maxFraction = 0.8,
  at?: { x: number; y: number },
): { x: number; y: number; width: number; height: number } {
  const ratio = media.width && media.height ? media.width / media.height : 1;
  let width = scene.width * maxFraction;
  let height = width / ratio;
  if (height > scene.height * maxFraction) {
    height = scene.height * maxFraction;
    width = height * ratio;
  }
  const cx = at?.x ?? scene.width / 2;
  const cy = at?.y ?? scene.height / 2;
  return {
    x: Math.round(cx - width / 2),
    y: Math.round(cy - height / 2),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}
