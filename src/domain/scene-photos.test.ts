import { describe, expect, it } from "vitest";
import { brandKitSchema, defaultBrandKit, type BrandKit } from "./brand-kit";
import { applyLayoutPreset } from "./layout-presets";
import { sceneDocumentSchema, type ImageLayer } from "./scene";
import {
  aspectFrame,
  assignScenePhoto,
  photoPair,
  referencedAssetIds,
  sceneAssetIds,
  scenePhotoLayers,
} from "./scene-photos";
import { ctaDocument, defaultProjectScenes } from "./scene-templates";

const kit = defaultBrandKit();
const A = "6f1c0a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const B = "7a2d1b3f-4c5e-4f60-9b0c-1d2e3f4a5b6c";
const interior = () => defaultProjectScenes(kit).find((s) => s.kind === "interior")!.document;

describe("assignScenePhoto", () => {
  it("fills slot 1 by changing only the frame's asset", () => {
    const doc = interior();
    const before = scenePhotoLayers(doc).slot1!;
    const next = assignScenePhoto(doc, 1, A, kit);
    const after = scenePhotoLayers(next).slot1!;
    expect(after.assetId).toBe(A);
    expect({ ...after, assetId: null }).toEqual({ ...before, assetId: null });
    expect(next.layers.length).toBe(doc.layers.length);
  });

  it("replacing keeps position, crop, rotation, opacity, order and motion", () => {
    const doc = assignScenePhoto(interior(), 1, A, kit);
    const edited = {
      ...doc,
      layers: doc.layers.map((l) =>
        l.role === "primaryImage"
          ? ({ ...l, x: 12, focalX: 0.2, zoom: 1.4, rotation: 3, opacity: 0.9 } as ImageLayer)
          : l,
      ),
    };
    const replaced = assignScenePhoto(edited, 1, B, kit);
    const index = edited.layers.findIndex((l) => l.role === "primaryImage");
    expect(replaced.layers[index]).toEqual({ ...edited.layers[index], assetId: B });
    expect(replaced.layers.filter((_, i) => i !== index)).toEqual(edited.layers.filter((_, i) => i !== index));
  });

  it("slot 2 adds a second photo over photo 1 with a crossfade", () => {
    const doc = assignScenePhoto(assignScenePhoto(interior(), 1, A, kit), 2, B, kit);
    const { slot1, slot2 } = scenePhotoLayers(doc);
    expect(slot2!.assetId).toBe(B);
    expect(slot2!.motion.transition.preset).toBe("crossfade");
    expect({ x: slot2!.x, y: slot2!.y, width: slot2!.width, height: slot2!.height }).toEqual({
      x: slot1!.x,
      y: slot1!.y,
      width: slot1!.width,
      height: slot1!.height,
    });
    expect(doc.layers.indexOf(slot2!)).toBe(doc.layers.indexOf(slot1!) + 1);
    expect(sceneAssetIds(doc)).toEqual([A, B]);
    expect(() => sceneDocumentSchema.parse(doc)).not.toThrow();
  });

  it("removing unassigns but keeps the frame", () => {
    const doc = assignScenePhoto(interior(), 1, A, kit);
    const cleared = assignScenePhoto(doc, 1, null, kit);
    expect(scenePhotoLayers(cleared).slot1?.assetId).toBeNull();
    expect(cleared.layers.length).toBe(doc.layers.length);
  });

  it("graphic-only CTA gets a full-bleed photo at the bottom only when assigned", () => {
    const cta = ctaDocument(kit);
    expect(assignScenePhoto(cta, 1, null, kit)).toBe(cta);
    const withPhoto = assignScenePhoto(cta, 1, A, kit);
    expect(withPhoto.layers[0]).toMatchObject({ type: "image", assetId: A, width: 1080, height: 300 });
  });

  it("assignments survive a layout change", () => {
    const doc = assignScenePhoto(interior(), 1, A, kit);
    const relaid = applyLayoutPreset(doc, "fullBleedOverlay", kit);
    expect(sceneAssetIds(relaid)[0]).toBe(A);
  });

  it("collects referenced ids across documents", () => {
    const doc = assignScenePhoto(interior(), 1, A, kit);
    expect([...referencedAssetIds([doc, interior()])]).toEqual([A]);
  });
});

describe("aspectFrame", () => {
  it("keeps the photo's aspect ratio inside the scene", () => {
    const frame = aspectFrame({ width: 1080, height: 1920 }, { width: 3000, height: 2000 });
    expect(frame.width / frame.height).toBeCloseTo(1.5, 1);
    expect(frame.width).toBeLessThanOrEqual(1080 * 0.8 + 1);
  });

  it("limits tall media by height and centers on a drop point", () => {
    const frame = aspectFrame({ width: 1080, height: 1080 }, { width: 1000, height: 4000 }, 0.8, { x: 300, y: 500 });
    expect(frame.height).toBe(864);
    expect(frame.x + frame.width / 2).toBeCloseTo(300, 0);
  });
});

describe("brand kit motion defaults", () => {
  it("kits saved before photoMotion existed still parse", () => {
    const old = structuredClone(defaultBrandKit()) as Record<string, unknown>;
    const md = old.motionDefaults as Record<string, unknown>;
    delete md.photoMotion;
    expect(brandKitSchema.parse(old).motionDefaults.photoMotion).toBe("slowZoomIn");
  });

  it("new scenes copy the defaults onto layers (not references)", () => {
    const custom: BrandKit = {
      ...kit,
      motionDefaults: { ...kit.motionDefaults, entranceFade: false, entranceMove: "scaleIn" },
    };
    const doc = defaultProjectScenes(custom)[0].document;
    const headline = doc.layers.find((l) => l.role === "headline")!;
    expect(headline.motion.entrance).toMatchObject({ fade: false, move: "scaleIn" });
    custom.motionDefaults.entranceMove = "slideDown";
    expect(headline.motion.entrance.move).toBe("scaleIn");
  });

  it("kits saved with a single entrancePreset migrate", () => {
    const old = structuredClone(defaultBrandKit()) as unknown as Record<string, Record<string, unknown>>;
    delete old.motionDefaults.entranceFade;
    delete old.motionDefaults.entranceMove;
    old.motionDefaults.entrancePreset = "fadeIn";
    old.motionDefaults.easing = "easeOutCubic";
    const parsed = brandKitSchema.parse(old).motionDefaults;
    expect(parsed).toMatchObject({ entranceFade: true, entranceMove: "none", easing: "easeOut" });
  });
});

describe("photoPair", () => {
  it("pairs Photo 2 only when it shares Photo 1's frame", () => {
    const doc = assignScenePhoto(assignScenePhoto(interior(), 1, A, kit), 2, B, kit);
    const pair = photoPair(doc);
    expect(pair.photo1?.assetId).toBe(A);
    expect(pair.photo2?.assetId).toBe(B);
  });

  it("side-by-side photos (Two-image split) are not a transition pair", () => {
    const split = applyLayoutPreset(assignScenePhoto(interior(), 1, A, kit), "twoImageSplit", kit);
    expect(photoPair(split).photo2).toBeUndefined();
  });

  it("a single photo has no pair", () => {
    expect(photoPair(interior()).photo2).toBeUndefined();
  });
});
