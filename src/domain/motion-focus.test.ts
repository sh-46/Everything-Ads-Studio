import { describe, expect, it } from "vitest";
import { defaultBrandKit } from "./brand-kit";
import { applyLayoutPreset } from "./layout-presets";
import { defaultMotion, type MotionConfig } from "./motion";
import {
  cameraCoverage,
  computeSceneTimings,
  effectiveFocus,
  evaluateMotion,
  focusFromFramePoint,
  focusInFrame,
  focusVisibility,
  imageRectInFrame,
  zoomedFraming,
} from "./motion-engine";
import { imageLayerSchema, makeLayer, type ImageLayer, type SceneDocument } from "./scene";
import { defaultProjectScenes } from "./scene-templates";

const base = defaultMotion();
const media = { width: 3000, height: 2000 }; // landscape photo
const zoomIn = (patch: Partial<MotionConfig["continuous"]> = {}): MotionConfig => ({
  ...base,
  continuous: { ...base.continuous, preset: "slowZoomIn", scaleStart: 1, scaleEnd: 1.5, easing: "linear", ...patch },
});
const photo = (patch: Partial<ImageLayer> = {}): ImageLayer =>
  makeLayer<ImageLayer>({
    id: "p",
    type: "image",
    name: "Photo",
    assetId: null,
    fit: "cover",
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    x: 0,
    y: 0,
    width: 1080,
    height: 1080,
    motion: zoomIn(),
    ...patch,
  });
const timing = (l: ImageLayer) => computeSceneTimings([l], 6000).get(l.id)!;

/** Where a content point (frame px, unanimated) appears on screen after the motion state. */
function onScreen(l: ImageLayer, contentPoint: { x: number; y: number }, t: number) {
  const s = evaluateMotion(l, timing(l), t, media);
  const o = s.contentOrigin ?? { x: l.width / 2, y: l.height / 2 };
  return {
    x: o.x + (contentPoint.x - o.x) * s.contentScale + s.contentTranslateX,
    y: o.y + (contentPoint.y - o.y) * s.contentScale + s.contentTranslateY,
  };
}

describe("motion focus point", () => {
  it("defaults to null and existing documents parse unchanged", () => {
    const parsed = imageLayerSchema.parse({ ...photo(), motionFocus: undefined });
    expect(parsed.motionFocus).toBeNull();
  });

  it("without a focus point, zoom stays centred on the frame (previous behaviour)", () => {
    const s = evaluateMotion(photo(), timing(photo()), 3000, media);
    expect(s.contentOrigin).toBeNull();
    expect(s.contentScale).toBeCloseTo(1.25);
  });

  it("zooms toward the focus point: it stays fixed while the rest scales away from it", () => {
    // Car at 80% across, 65% down the photo.
    const l = photo({ motionFocus: { x: 0.8, y: 0.65 } });
    const p = focusInFrame(l, media)!;
    for (const t of [0, 3000, 6000]) {
      const q = onScreen(l, p, t);
      expect(q.x).toBeCloseTo(p.x, 6);
      expect(q.y).toBeCloseTo(p.y, 6);
    }
    // Another point moves away from the focus as the zoom grows.
    const other = { x: p.x - 200, y: p.y };
    expect(onScreen(l, other, 6000).x).toBeCloseTo(p.x - 300, 6);
  });

  it("is stored relative to the photo, accounting for crop, fit and static zoom", () => {
    const l = photo({ motionFocus: { x: 0.8, y: 0.5 }, focalX: 0.2, zoom: 1.3 });
    const rect = imageRectInFrame(l, media);
    const p = focusInFrame(l, media)!;
    expect(p.x).toBeCloseTo(rect.x + 0.8 * rect.width);
    // Changing the static crop moves the frame point but not the image point.
    const recropped = { ...l, focalX: 0.7 };
    const p2 = focusInFrame(recropped, media)!;
    expect(p2.x).not.toBeCloseTo(p.x);
    expect(focusFromFramePoint(recropped, media, p2).x).toBeCloseTo(0.8);
  });

  it("round-trips between frame and image coordinates", () => {
    const l = photo({ focalX: 0.3, zoom: 1.2 });
    const f = focusFromFramePoint(l, media, { x: 700, y: 400 });
    const back = focusInFrame({ ...l, motionFocus: f }, media)!;
    expect(back.x).toBeCloseTo(700);
    expect(back.y).toBeCloseTo(400);
  });

  it("effective focus without a custom point is the frame center in image coords", () => {
    const f = effectiveFocus(photo(), media);
    expect(f.x).toBeCloseTo(0.5);
    expect(f.y).toBeCloseTo(0.5);
  });

  it("survives resizing the frame and changing the layout", () => {
    const kit = defaultBrandKit();
    const scene = defaultProjectScenes(kit).find((s) => s.kind === "interior")!.document;
    const doc: SceneDocument = {
      ...scene,
      layers: scene.layers.map((l) =>
        l.role === "primaryImage" ? { ...(l as ImageLayer), motionFocus: { x: 0.8, y: 0.6 } } : l,
      ),
    };
    const relaid = applyLayoutPreset(doc, "fullBleedOverlay", kit);
    expect((relaid.layers.find((l) => l.role === "primaryImage") as ImageLayer).motionFocus).toEqual({
      x: 0.8,
      y: 0.6,
    });
    const resized = { ...photo({ motionFocus: { x: 0.8, y: 0.6 } }), width: 600, height: 900 };
    const rect = imageRectInFrame(resized, media);
    expect(focusInFrame(resized, media)!.x).toBeCloseTo(rect.x + 0.8 * rect.width);
  });

  it("zoom-in about a focus point never exposes edges", () => {
    const l = photo({ motionFocus: { x: 0.95, y: 0.9 } });
    expect(cameraCoverage(l, media, timing(l)).covered).toBe(true);
  });

  it("zoom-out about a focus point warns and the fix factor covers it", () => {
    const l = photo({
      motionFocus: { x: 0.8, y: 0.65 },
      motion: zoomIn({ preset: "slowZoomOut", scaleStart: 1.2, scaleEnd: 0.9 }),
    });
    const result = cameraCoverage(l, media, timing(l));
    expect(result.covered).toBe(false);
    const k = result.minScaleNeeded * 1.002;
    const fixed = { ...l, motion: zoomIn({ preset: "slowZoomOut", scaleStart: 1.2 * k, scaleEnd: 0.9 * k }) };
    expect(cameraCoverage(fixed, media, timing(fixed)).covered).toBe(true);
  });

  it("pans with a focus point scale about it and stay covered", () => {
    for (const preset of ["panLeft", "panRight"] as const) {
      const l = photo({
        motionFocus: { x: 0.85, y: 0.6 },
        motion: { ...base, continuous: { ...base.continuous, preset, distance: 160, scaleStart: 1, easing: "linear" } },
      });
      const s = evaluateMotion(l, timing(l), 0, media);
      expect(s.contentOrigin).toEqual(focusInFrame(l, media));
      expect(cameraCoverage(l, media, timing(l)).covered).toBe(true);
    }
  });

  it("pans without a focus point keep the original math", () => {
    const l = photo({
      motion: { ...base, continuous: { ...base.continuous, preset: "panLeft", distance: 108, scaleStart: 1 } },
    });
    const s = evaluateMotion(l, timing(l), 0, media);
    expect(s.contentOrigin).toBeNull();
    expect(s.contentScale).toBeCloseTo(1 + 108 / 1080);
    expect(s.contentTranslateX).toBeCloseTo(54);
  });

  it("framing assistance: flags a point cropped out of view, or one a long pan carries out", () => {
    // A tall frame crops the sides of a landscape photo: x = 2% is off-screen.
    const tall = photo({ width: 600, height: 1080, motionFocus: { x: 0.02, y: 0.5 } });
    expect(focusVisibility(tall, media, timing(tall)).outsideFrame).toBe(true);
    const nearEdge = photo({
      motionFocus: { x: 0.52, y: 0.5 },
      width: 1080,
      height: 1080,
      motion: { ...base, continuous: { ...base.continuous, preset: "panRight", distance: 4000, scaleStart: 1 } },
    });
    expect(focusVisibility(nearEdge, media, timing(nearEdge)).leavesFrame).toBe(true);
  });

  it("the framing guide is the visible area at full zoom around the focus", () => {
    const l = photo({ motionFocus: { x: 0.5, y: 0.5 } });
    const p = focusInFrame(l, media)!;
    const r = zoomedFraming(l, media)!;
    expect(r.width).toBeCloseTo(1080 / 1.5);
    expect(r.x).toBeCloseTo(p.x - p.x / 1.5);
  });

  it("a zoom transition on Photo 2 settles onto its focus point", () => {
    const l = photo({
      motionFocus: { x: 0.7, y: 0.5 },
      role: "secondaryImage",
      motion: { ...base, transition: { preset: "zoom", durationMs: 1000, easing: "linear", direction: "left" } },
    });
    const s = evaluateMotion(l, timing(l), 500, media);
    expect(s.contentOrigin).toEqual(focusInFrame(l, media));
  });
});
