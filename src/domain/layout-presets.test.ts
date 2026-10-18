import { describe, expect, it } from "vitest";
import { brandKitSchema, defaultBrandKit } from "./brand-kit";
import { applyLayoutPreset, LAYOUT_PRESETS } from "./layout-presets";
import { sceneDocumentSchema, type ImageLayer, type TextLayer } from "./scene";
import { defaultProjectScenes } from "./scene-templates";

const kit = defaultBrandKit();

describe("brand kit", () => {
  it("default kit satisfies its schema", () => {
    expect(brandKitSchema.parse(kit)).toEqual(kit);
  });
});

describe("default project scenes", () => {
  const scenes = defaultProjectScenes(kit);

  it("creates the standard production set with valid documents", () => {
    expect(scenes.map((s) => s.kind)).toEqual(["intro", "exterior", "interior", "performance", "outro", "feed", "cta"]);
    for (const scene of scenes) expect(() => sceneDocumentSchema.parse(scene.document)).not.toThrow();
  });

  it("uses production dimension presets", () => {
    const size = (kind: string) => {
      const doc = scenes.find((s) => s.kind === kind)!.document;
      return [doc.width, doc.height];
    };
    expect(size("interior")).toEqual([1080, 1920]);
    expect(size("feed")).toEqual([1080, 1080]);
    expect(size("outro")).toEqual([1080, 1620]);
    expect(size("cta")).toEqual([1080, 300]);
  });

  it("gives every layer a unique id", () => {
    const ids = scenes.flatMap((s) => s.document.layers.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("copies brand typography into text layers", () => {
    const headline = scenes[0].document.layers.find((l) => l.role === "headline") as TextLayer;
    expect(headline.fontFamily).toBe(kit.typography.headline.fontFamily);
    expect(headline.fontWeight).toBe(kit.typography.headline.fontWeight);
    expect(headline.styleRef).toBe("headline");
  });
});

describe("applyLayoutPreset", () => {
  const base = defaultProjectScenes(kit).find((s) => s.kind === "interior")!.document;
  const assetId = "6f1c0a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
  const customized = {
    ...base,
    layers: base.layers.map((l) => {
      if (l.role === "primaryImage") return { ...l, assetId, focalX: 0.2 } as ImageLayer;
      if (l.role === "headline") return { ...l, text: "Crafted for every journey", color: "#FF0000" } as TextLayer;
      return l;
    }),
  };

  it.each(LAYOUT_PRESETS.map((p) => p.id))("%s keeps photos and copy", (presetId) => {
    const next = applyLayoutPreset(customized, presetId, kit);
    expect(() => sceneDocumentSchema.parse(next)).not.toThrow();
    const image = next.layers.find((l) => l.role === "primaryImage") as ImageLayer;
    const headline = next.layers.find((l) => l.role === "headline") as TextLayer;
    expect(image.assetId).toBe(assetId);
    expect(image.focalX).toBe(0.2);
    expect(headline.text).toBe("Crafted for every journey");
    expect(headline.color).toBe("#FF0000");
    expect(next.layout).toBe(presetId);
  });

  it("keeps user-added layers on top", () => {
    const extra = { ...base.layers[0], id: "extra-layer", role: undefined, name: "My shape" };
    const next = applyLayoutPreset({ ...customized, layers: [...customized.layers, extra] }, "fullBleedOverlay", kit);
    expect(next.layers[next.layers.length - 1].id).toBe("extra-layer");
  });

  it("keeps layer ids stable so undo and selection survive", () => {
    const headlineId = customized.layers.find((l) => l.role === "headline")!.id;
    const next = applyLayoutPreset(customized, "imageTopTextBottom", kit);
    expect(next.layers.find((l) => l.role === "headline")!.id).toBe(headlineId);
  });

  it("does not mutate the input document", () => {
    const snapshot = structuredClone(customized);
    applyLayoutPreset(customized, "twoImageSplit", kit);
    expect(customized).toEqual(snapshot);
  });
});
