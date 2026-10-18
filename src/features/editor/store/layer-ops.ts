import { newLayerId, type Layer, type SceneDocument } from "@/domain/scene";

/** Pure, immutable operations on a scene document. Layer order: index 0 is the bottom. */

/** Distributes over the layer union so type-specific fields (e.g. `text`) are allowed. */
export type LayerPatch = Layer extends infer L ? (L extends Layer ? Partial<Omit<L, "id" | "type">> : never) : never;

export function updateLayer(doc: SceneDocument, layerId: string, patch: LayerPatch): SceneDocument {
  return {
    ...doc,
    layers: doc.layers.map((layer) => (layer.id === layerId ? ({ ...layer, ...patch } as Layer) : layer)),
  };
}

export function addLayer(doc: SceneDocument, layer: Layer, index = doc.layers.length): SceneDocument {
  const layers = [...doc.layers];
  layers.splice(Math.max(0, Math.min(index, layers.length)), 0, layer);
  return { ...doc, layers };
}

export function removeLayer(doc: SceneDocument, layerId: string): SceneDocument {
  return { ...doc, layers: doc.layers.filter((l) => l.id !== layerId) };
}

export function duplicateLayer(
  doc: SceneDocument,
  layerId: string,
  offset = 24,
): { doc: SceneDocument; newId: string | null } {
  const index = doc.layers.findIndex((l) => l.id === layerId);
  if (index === -1) return { doc, newId: null };
  const source = doc.layers[index];
  const copy: Layer = {
    ...structuredClone(source),
    id: newLayerId(),
    name: `${source.name} copy`,
    // A copy is free-floating; layout presets should not treat it as the original slot.
    role: undefined,
    x: source.x + offset,
    y: source.y + offset,
  };
  return { doc: addLayer(doc, copy, index + 1), newId: copy.id };
}

export type ReorderDirection = "forward" | "backward" | "front" | "back";

export function reorderLayer(doc: SceneDocument, layerId: string, direction: ReorderDirection): SceneDocument {
  const index = doc.layers.findIndex((l) => l.id === layerId);
  if (index === -1) return doc;
  const last = doc.layers.length - 1;
  const target =
    direction === "forward"
      ? Math.min(last, index + 1)
      : direction === "backward"
        ? Math.max(0, index - 1)
        : direction === "front"
          ? last
          : 0;
  return moveLayer(doc, layerId, target);
}

export function moveLayer(doc: SceneDocument, layerId: string, targetIndex: number): SceneDocument {
  const index = doc.layers.findIndex((l) => l.id === layerId);
  if (index === -1 || index === targetIndex) return doc;
  const layers = [...doc.layers];
  const [layer] = layers.splice(index, 1);
  layers.splice(Math.max(0, Math.min(targetIndex, layers.length)), 0, layer);
  return { ...doc, layers };
}

export type SceneAlignment = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

/** Aligns an unrotated layer box to the scene edges or center. */
export function alignLayerToScene(doc: SceneDocument, layerId: string, alignment: SceneAlignment): SceneDocument {
  const layer = doc.layers.find((l) => l.id === layerId);
  if (!layer) return doc;
  const patch: LayerPatch = {};
  switch (alignment) {
    case "left":
      patch.x = 0;
      break;
    case "centerX":
      patch.x = Math.round((doc.width - layer.width) / 2);
      break;
    case "right":
      patch.x = doc.width - layer.width;
      break;
    case "top":
      patch.y = 0;
      break;
    case "centerY":
      patch.y = Math.round((doc.height - layer.height) / 2);
      break;
    case "bottom":
      patch.y = doc.height - layer.height;
      break;
  }
  return updateLayer(doc, layerId, patch);
}
