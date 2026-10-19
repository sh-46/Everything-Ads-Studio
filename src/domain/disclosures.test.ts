import { describe, expect, it } from "vitest";
import { assetSchema, type Asset } from "./asset";
import { defaultBrandKit } from "./brand-kit";
import {
  applyDisclosureDecision,
  disclosureIssues,
  disclosureLayersFor,
  ensureDisclosureLayer,
  fitDisclosureHeight,
  isDisclosureLayer,
  moveIntoSafeArea,
  planLayerRemoval,
  planPhotoChange,
  resolveLayerText,
  safeArea,
  syncDisclosuresForAsset,
} from "./disclosures";
import { computeSceneTimings, evaluateMotion, IDENTITY_MOTION } from "./motion-engine";
import { sceneDocumentSchema, type ImageLayer, type SceneDocument, type TextLayer } from "./scene";
import { assignScenePhoto, photoPair } from "./scene-photos";
import { DEFAULT_SCENE_DURATION_MS, defaultProjectScenes } from "./scene-templates";
import { computeVisibility, hiddenInStaticLayout, isVisibleAt, photoWindow } from "./visibility";

const kit = defaultBrandKit();
const P1 = "6f1c0a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const P2 = "7a2d1b3f-4c5e-4f60-9b0c-1d2e3f4a5b6c";
const P3 = "8b3e2c4a-5d6f-4a71-8c1d-2e3f4a5b6c7d";

function photo(id: string, disclosure?: string): Asset {
  return assetSchema.parse({
    id,
    kind: "photo",
    url: `/p/${id}`,
    width: 2400,
    height: 1600,
    originalFilename: `${id.slice(0, 4)}.jpg`,
    mimeType: "image/jpeg",
    projectId: P3,
    createdAt: "2026-10-19T00:00:00Z",
    metadata: disclosure === undefined ? {} : { requiresDisclosure: true, disclosureText: disclosure },
  });
}

const withDisclosure = photo(P1, "Pre-production model shown. Actual production model may vary.");
const other = photo(P2, "Optional equipment shown.");
const plain = photo(P3);
const lookup = (...assets: Asset[]) => new Map(assets.map((a) => [a.id, a]));

const exterior = (): SceneDocument => defaultProjectScenes(kit).find((s) => s.kind === "exterior")!.document;
const frameId = (doc: SceneDocument, slot: "photo1" | "photo2" = "photo1") => photoPair(doc)[slot]!.id;

/** Exterior with Photo 1 (+ optional Photo 2) and disclosures ensured for both. */
function twoPhotoScene(a: Asset, b: Asset) {
  let doc = assignScenePhoto(assignScenePhoto(exterior(), 1, a.id, kit), 2, b.id, kit);
  const assets = lookup(a, b);
  for (const slot of ["photo1", "photo2"] as const) {
    const asset = slot === "photo1" ? a : b;
    const plan = planPhotoChange({ ...doc, layers: doc.layers }, null, asset, assets);
    doc = applyDisclosureDecision(doc, frameId(doc, slot), plan, "apply", assets, kit);
  }
  return { doc, assets };
}

describe("scene durations", () => {
  it("defaults to 7 s for the Motion Tile and 10 s for Facebook Build video scenes", () => {
    const scenes = defaultProjectScenes(kit);
    const duration = (kind: string) => scenes.find((s) => s.kind === kind)!.document.durationMs;
    expect(duration("feed")).toBe(7000);
    for (const kind of ["intro", "exterior", "interior", "performance", "outro"]) expect(duration(kind)).toBe(10_000);
    expect(DEFAULT_SCENE_DURATION_MS.feed).toBe(7000);
  });

  it("keeps the duration of existing documents (only missing values default)", () => {
    const stored = { ...exterior(), durationMs: 6000 };
    expect(sceneDocumentSchema.parse(stored).durationMs).toBe(6000);
  });
});

describe("static motion and visibility timing", () => {
  it("parses old documents as animated and always visible", () => {
    const doc = sceneDocumentSchema.parse(JSON.parse(JSON.stringify(exterior())));
    for (const layer of doc.layers) {
      expect(layer.motion.static).toBe(false);
      expect(layer.visibility.mode).toBe("always");
    }
  });

  it("static layers never move, regardless of their other motion settings", () => {
    const doc = exterior();
    const headline = doc.layers.find((l) => l.role === "headline")!;
    const still = { ...headline, motion: { ...headline.motion, static: true } };
    const timings = computeSceneTimings([still], doc.durationMs);
    for (const t of [0, 100, 500, 5000, 9999])
      expect(evaluateMotion(still, timings.get(still.id), t)).toEqual(IDENTITY_MOTION);
  });

  it("a visibility range cuts the layer in and out without affecting its motion", () => {
    const doc = exterior();
    const headline = doc.layers.find((l) => l.role === "headline")!;
    const ranged = { ...headline, visibility: { mode: "range" as const, startMs: 2000, endMs: 4000 } };
    const next = { ...doc, layers: doc.layers.map((l) => (l.id === headline.id ? ranged : l)) };
    const timings = computeSceneTimings(next.layers, next.durationMs);
    const window = computeVisibility(next, timings).get(headline.id);
    expect([1999, 2000, 3999, 4000].map((t) => isVisibleAt(window, t))).toEqual([false, true, true, false]);
    // Motion timing is untouched by the visibility range.
    expect(timings.get(headline.id)).toEqual(computeSceneTimings(doc.layers, doc.durationMs).get(headline.id));
  });
});

describe("disclosure layers", () => {
  it("are created static, in the safe area, in brand body type, following their photo", () => {
    const doc0 = assignScenePhoto(exterior(), 1, P1, kit);
    const doc = ensureDisclosureLayer(doc0, frameId(doc0), withDisclosure, kit);
    const [layer] = disclosureLayersFor(doc, frameId(doc));
    const safe = safeArea(doc);
    expect(layer.motion.static).toBe(true);
    expect(layer.visibility.mode).toBe("linkedPhoto");
    expect(layer.fontFamily).toBe(kit.typography.body.fontFamily);
    expect(layer.x).toBeGreaterThanOrEqual(safe.x);
    expect(layer.y + layer.height).toBeLessThanOrEqual(safe.y + safe.height);
    expect(resolveLayerText(layer, lookup(withDisclosure))).toBe(withDisclosure.metadata.disclosureText);
    expect(disclosureIssues(doc, lookup(withDisclosure))).toEqual([]);
  });

  it("never duplicates: ensuring twice keeps one layer", () => {
    const doc0 = assignScenePhoto(exterior(), 1, P1, kit);
    const once = ensureDisclosureLayer(doc0, frameId(doc0), withDisclosure, kit);
    const twice = ensureDisclosureLayer(once, frameId(once), withDisclosure, kit);
    expect(twice.layers.filter(isDisclosureLayer)).toHaveLength(1);
  });

  it("show the photo library's current wording (single source of truth)", () => {
    const doc0 = assignScenePhoto(exterior(), 1, P1, kit);
    const doc = ensureDisclosureLayer(doc0, frameId(doc0), withDisclosure, kit);
    const layer = doc.layers.find(isDisclosureLayer)!;
    const edited = { ...withDisclosure, metadata: { ...withDisclosure.metadata, disclosureText: "Updated wording." } };
    expect(resolveLayerText(layer, lookup(edited))).toBe("Updated wording.");
    const off = { ...withDisclosure, metadata: { requiresDisclosure: false } };
    expect(resolveLayerText(layer, lookup(off))).toBe("");
  });

  it("two-photo transition: each photo keeps its own disclosure, handed over mid-transition", () => {
    const { doc, assets } = twoPhotoScene(withDisclosure, other);
    const { photo1, photo2 } = photoPair(doc);
    const d1 = disclosureLayersFor(doc, photo1!.id)[0];
    const d2 = disclosureLayersFor(doc, photo2!.id)[0];
    expect(resolveLayerText(d1, assets)).toBe(withDisclosure.metadata.disclosureText);
    expect(resolveLayerText(d2, assets)).toBe(other.metadata.disclosureText);
    // Same place, so the hand-over is in place.
    expect([d2.x, d2.y + d2.height]).toEqual([d1.x, d1.y + d1.height]);

    const timings = computeSceneTimings(doc.layers, doc.durationMs);
    const windows = computeVisibility(doc, timings);
    const t2 = timings.get(photo2!.id)!;
    const mid = t2.start + photo2!.motion.transition.durationMs / 2;
    expect(isVisibleAt(windows.get(d1.id), mid - 1)).toBe(true);
    expect(isVisibleAt(windows.get(d2.id), mid - 1)).toBe(false);
    expect(isVisibleAt(windows.get(d1.id), mid)).toBe(false);
    expect(isVisibleAt(windows.get(d2.id), mid)).toBe(true);
    expect(isVisibleAt(windows.get(d2.id), doc.durationMs - 1)).toBe(true);
    // Never both at once.
    for (let t = 0; t < doc.durationMs; t += 50) {
      expect(isVisibleAt(windows.get(d1.id), t) && isVisibleAt(windows.get(d2.id), t)).toBe(false);
    }
    expect(photoWindow(doc, photo1!.id, timings).from).toBe(0);
    // Static layout (CTA PNG / editor default) shows Photo 2's disclosure only.
    expect([...hiddenInStaticLayout(doc)]).toEqual([d1.id]);
    expect(disclosureIssues(doc, assets)).toEqual([]);
  });

  it("only photos that require a disclosure get one", () => {
    const { doc } = twoPhotoScene(withDisclosure, plain);
    const { photo1, photo2 } = photoPair(doc);
    expect(disclosureLayersFor(doc, photo1!.id)).toHaveLength(1);
    expect(disclosureLayersFor(doc, photo2!.id)).toHaveLength(0);
  });
});

describe("photo replace / remove / reassign", () => {
  const start = () => {
    const doc0 = assignScenePhoto(exterior(), 1, P1, kit);
    return ensureDisclosureLayer(doc0, frameId(doc0), withDisclosure, kit);
  };

  it("replacing with another disclosed photo asks, then relinks the same layer", () => {
    const doc = start();
    const assets = lookup(withDisclosure, other);
    const plan = planPhotoChange(doc, frameId(doc), other, assets);
    expect(plan.change).toBe("relink");
    expect(plan.prompt).not.toBeNull();
    const before = doc.layers.find(isDisclosureLayer)!;
    const swapped = assignScenePhoto(doc, 1, other.id, kit);
    const next = applyDisclosureDecision(swapped, frameId(swapped), plan, "apply", assets, kit);
    const after = next.layers.filter(isDisclosureLayer);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].disclosure.assetId).toBe(other.id);
  });

  it("replacing with a photo without a disclosure offers remove or keep-as-text", () => {
    const doc = start();
    const assets = lookup(withDisclosure, plain);
    const plan = planPhotoChange(doc, frameId(doc), plain, assets);
    expect(plan.change).toBe("remove");
    const swapped = assignScenePhoto(doc, 1, plain.id, kit);
    expect(
      applyDisclosureDecision(swapped, frameId(swapped), plan, "apply", assets, kit).layers.some(isDisclosureLayer),
    ).toBe(false);
    const kept = applyDisclosureDecision(swapped, frameId(swapped), plan, "keepAsText", assets, kit);
    const text = kept.layers.find((l) => l.name.startsWith("Disclosure")) as TextLayer;
    expect(text.disclosure).toBeNull();
    expect(text.text).toBe(withDisclosure.metadata.disclosureText);
  });

  it("removing the photo asks about its disclosure", () => {
    const doc = start();
    expect(planPhotoChange(doc, frameId(doc), null, lookup(withDisclosure)).change).toBe("remove");
    expect(planLayerRemoval(doc, frameId(doc)).prompt).not.toBeNull();
  });

  it("replacing a plain photo with a disclosed one asks before adding; new frames add automatically", () => {
    const doc = assignScenePhoto(exterior(), 1, P3, kit);
    const plan = planPhotoChange(doc, frameId(doc), withDisclosure, lookup(withDisclosure, plain));
    expect(plan.change).toBe("add");
    expect(plan.prompt).not.toBeNull();
    expect(planPhotoChange(doc, null, withDisclosure, lookup(withDisclosure)).prompt).toBeNull();
    const skipped = applyDisclosureDecision(
      assignScenePhoto(doc, 1, P1, kit),
      frameId(doc),
      plan,
      "skip",
      lookup(withDisclosure),
      kit,
    );
    expect(disclosureIssues(skipped, lookup(withDisclosure)).map((i) => i.fix)).toEqual(["add"]);
  });

  it("longer wording grows the existing box (bottom edge kept) without duplicating", () => {
    const doc = start();
    const before = doc.layers.find(isDisclosureLayer)!;
    const longer = photo(P1, `${withDisclosure.metadata.disclosureText} `.repeat(4).trim());
    const result = syncDisclosuresForAsset(doc, longer, kit);
    const after = result.doc.layers.filter(isDisclosureLayer);
    expect(result.changed).toBe(true);
    expect(after).toHaveLength(1);
    expect(after[0].height).toBeGreaterThan(before.height);
    expect(after[0].y + after[0].height).toBe(before.y + before.height);
    expect(disclosureIssues(result.doc, lookup(longer))).toEqual([]);
    expect(syncDisclosuresForAsset(result.doc, longer, kit).changed).toBe(false);
  });

  it("library changes sync every frame using the photo", () => {
    const doc = assignScenePhoto(exterior(), 1, P3, kit);
    const nowRequired = photo(P3, "Shown with accessories.");
    const added = syncDisclosuresForAsset(doc, nowRequired, kit);
    expect(added.added).toBe(1);
    const removed = syncDisclosuresForAsset(added.doc, plain, kit);
    expect(removed.removed).toBe(1);
  });
});

describe("disclosure review", () => {
  const scene = () => {
    const doc0 = assignScenePhoto(exterior(), 1, P1, kit);
    return ensureDisclosureLayer(doc0, frameId(doc0), withDisclosure, kit);
  };
  const patch = (doc: SceneDocument, p: Partial<TextLayer>) => ({
    ...doc,
    layers: doc.layers.map((l) => (isDisclosureLayer(l) ? ({ ...l, ...p } as TextLayer) : l)),
  });
  const codes = (doc: SceneDocument) =>
    disclosureIssues(doc, lookup(withDisclosure)).map((i) => `${i.severity}:${i.fix ?? "-"}`);

  it("flags a missing disclosure", () => {
    expect(codes(assignScenePhoto(exterior(), 1, P1, kit))).toEqual(["error:add"]);
  });
  it("flags a hidden disclosure", () => {
    expect(codes(patch(scene(), { visible: false }))).toEqual(["error:show"]);
  });
  it("flags clipping at the scene edge, the safe area and overflowing text", () => {
    expect(codes(patch(scene(), { y: 1900 }))).toContain("error:moveIntoSafeArea");
    expect(codes(patch(scene(), { y: 40 }))).toContain("warning:moveIntoSafeArea");
    expect(codes(patch(scene(), { height: 10 }))).toContain("error:fitHeight");
  });
  it("flags a disclosure sitting on other copy, and places new ones clear of it", () => {
    const doc = scene();
    const headline = doc.layers.find((l) => l.role === "headline")!;
    const disclosure = doc.layers.find(isDisclosureLayer)!;
    const overlapsAny = (d: SceneDocument) =>
      disclosureIssues(d, lookup(withDisclosure)).some((i) => /overlaps/.test(i.message));
    expect(overlapsAny(doc)).toBe(false);
    expect(overlapsAny(patch(doc, { x: headline.x, y: headline.y }))).toBe(true);
    expect(disclosure.y + disclosure.height).toBeLessThanOrEqual(safeArea(doc).y + safeArea(doc).height);
  });
  it("flags text that is too small", () => {
    expect(codes(patch(scene(), { fontSize: 12 }))).toContain("warning:-");
  });
  it("flags a disclosure that doesn't cover its photo's time on screen", () => {
    const doc = patch(scene(), { visibility: { mode: "range", startMs: 2000, endMs: null } });
    expect(codes(doc)).toEqual(["error:-"]);
  });
  it("quick fixes resolve the problems they target", () => {
    const fixed = (doc: SceneDocument, fix: "fitHeight" | "moveIntoSafeArea") => {
      const id = doc.layers.find(isDisclosureLayer)!.id;
      return fix === "fitHeight"
        ? fitDisclosureHeight(doc, id, lookup(withDisclosure))
        : moveIntoSafeArea(doc, id, lookup(withDisclosure));
    };
    expect(codes(fixed(patch(scene(), { height: 10 }), "fitHeight"))).toEqual([]);
    expect(codes(fixed(patch(scene(), { y: 1900 }), "moveIntoSafeArea"))).toEqual([]);
  });
  it("frames with photos that need no disclosure are fine", () => {
    expect(disclosureIssues(assignScenePhoto(exterior(), 1, P3, kit), lookup(plain))).toEqual([]);
  });
  it("image layers stay unaffected by the review types", () => {
    const doc = scene();
    expect((doc.layers.find((l) => l.type === "image") as ImageLayer).assetId).toBe(P1);
  });
});
