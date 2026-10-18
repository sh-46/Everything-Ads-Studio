import { describe, expect, it } from "vitest";
import { makeLayer, type SceneDocument, type ShapeLayer } from "@/domain/scene";
import { alignLayerToScene, duplicateLayer, moveLayer, removeLayer, reorderLayer, updateLayer } from "./layer-ops";

const shape = (id: string): ShapeLayer =>
  makeLayer<ShapeLayer>({
    id,
    type: "shape",
    name: id,
    shape: "rect",
    fill: "#FFFFFF",
    cornerRadius: 0,
    x: 10,
    y: 20,
    width: 100,
    height: 50,
  });

const doc: SceneDocument = {
  schemaVersion: 1,
  width: 1080,
  height: 1920,
  background: "#000000",
  durationMs: 6000,
  layers: [shape("a"), shape("b"), shape("c")],
};

const ids = (d: SceneDocument) => d.layers.map((l) => l.id);

describe("layer ops", () => {
  it("updates one layer immutably", () => {
    const next = updateLayer(doc, "b", { x: 99 });
    expect(next.layers[1].x).toBe(99);
    expect(doc.layers[1].x).toBe(10);
    expect(next.layers[0]).toBe(doc.layers[0]);
  });

  it("removes a layer", () => {
    expect(ids(removeLayer(doc, "b"))).toEqual(["a", "c"]);
  });

  it("duplicates above the source with a new id and offset", () => {
    const { doc: next, newId } = duplicateLayer(doc, "a");
    expect(next.layers).toHaveLength(4);
    expect(next.layers[1].id).toBe(newId);
    expect(newId).not.toBe("a");
    expect(next.layers[1].x).toBe(34);
    expect(next.layers[1].role).toBeUndefined();
  });

  it("reorders forward, backward, front and back", () => {
    expect(ids(reorderLayer(doc, "a", "forward"))).toEqual(["b", "a", "c"]);
    expect(ids(reorderLayer(doc, "c", "backward"))).toEqual(["a", "c", "b"]);
    expect(ids(reorderLayer(doc, "a", "front"))).toEqual(["b", "c", "a"]);
    expect(ids(reorderLayer(doc, "c", "back"))).toEqual(["c", "a", "b"]);
    expect(ids(reorderLayer(doc, "c", "forward"))).toEqual(["a", "b", "c"]);
  });

  it("moves to an index", () => {
    expect(ids(moveLayer(doc, "c", 0))).toEqual(["c", "a", "b"]);
  });

  it("aligns to scene edges and center", () => {
    expect(alignLayerToScene(doc, "a", "centerX").layers[0].x).toBe(490);
    expect(alignLayerToScene(doc, "a", "bottom").layers[0].y).toBe(1870);
    expect(alignLayerToScene(doc, "a", "right").layers[0].x).toBe(980);
  });
});
