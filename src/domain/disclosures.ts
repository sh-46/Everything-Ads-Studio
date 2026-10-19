import { assetLabel, photoDisclosureText, requiresDisclosure, type Asset } from "./asset";
import type { BrandKit } from "./brand-kit";
import type { Rect } from "./geometry";
import { staticMotion } from "./motion";
import { computeSceneTimings } from "./motion-engine";
import { photoPair } from "./scene-photos";
import {
  makeLayer,
  type DisclosureLink,
  type ImageLayer,
  type Layer,
  type SceneDocument,
  type TextLayer,
} from "./scene";
import { estimateTextWidth, textBlockHeight, type MeasureText } from "./text-layout";
import { layerWindow, photoWindow } from "./visibility";

/**
 * Photo disclosures. The wording belongs to the photo (asset metadata) and is reused in
 * every scene; each scene has at most one disclosure layer per photo frame, linked by
 * `disclosure.{assetId, imageLayerId}`. Disclosure layers are static (no motion) and
 * visible exactly while their photo is on screen.
 */

export type DisclosureLayer = TextLayer & { disclosure: DisclosureLink };
type AssetLookup = Map<string, Asset>;

export function isDisclosureLayer(layer: Layer): layer is DisclosureLayer {
  return layer.type === "text" && layer.disclosure !== null;
}

export function disclosureLayersFor(doc: SceneDocument, imageLayerId: string): DisclosureLayer[] {
  return doc.layers.filter(
    (l): l is DisclosureLayer => isDisclosureLayer(l) && l.disclosure.imageLayerId === imageLayerId,
  );
}

/**
 * What a text layer displays. Disclosure layers show their photo's current wording, or
 * nothing once the photo no longer requires one (the review flags that layer); if the
 * photo can't be found, the last known copy is kept rather than dropping the text.
 */
export function resolveLayerText(layer: TextLayer, assets: AssetLookup): string {
  if (!layer.disclosure) return layer.text;
  const asset = assets.get(layer.disclosure.assetId);
  if (!asset) return layer.text;
  return photoDisclosureText(asset) ?? "";
}

/**
 * Area kept clear of platform UI. 9:16 stories/reels: top 14%, bottom 20% and 6% at the
 * sides (Meta's safe zone guidance). Other formats: a 5% margin (Outro: 6% sides/top).
 */
export function safeArea(doc: Pick<SceneDocument, "width" | "height">): Rect {
  const { width, height } = doc;
  const inset = (left: number, top: number, right: number, bottom: number): Rect => ({
    x: Math.round(width * left),
    y: Math.round(height * top),
    width: Math.round(width * (1 - left - right)),
    height: Math.round(height * (1 - top - bottom)),
  });
  if (height / width >= 1.7) return inset(0.06, 0.14, 0.06, 0.2);
  if (height / width >= 1.4) return inset(0.06, 0.06, 0.06, 0.04);
  return inset(0.05, 0.05, 0.05, 0.05);
}

/** Smallest legible disclosure size: 18 px per 1080 px of scene width. */
export function minDisclosureFontSize(doc: Pick<SceneDocument, "width">): number {
  return Math.round((18 * doc.width) / 1080);
}

function defaultFontSize(doc: Pick<SceneDocument, "width">): number {
  return Math.max(minDisclosureFontSize(doc), Math.round((26 * doc.width) / 1080));
}

/**
 * Moves a box up past any copy it would sit on (headline, subtitle…), staying inside the
 * safe area; returns the new bottom edge (unchanged when there's no room above).
 */
function clearOfCopy(
  doc: SceneDocument,
  box: { x: number; width: number; height: number; bottom: number },
  gap: number,
  measure: MeasureText,
  ignoreId?: string,
): number {
  const safe = safeArea(doc);
  const copy = doc.layers
    .filter((l): l is TextLayer => l.type === "text" && l.visible && !isDisclosureLayer(l) && l.id !== ignoreId)
    .map((l) => ({
      x: l.x,
      y: l.y,
      right: l.x + l.width,
      bottom: l.y + Math.max(l.height, textBlockHeight(l.text, l.width, l, measure)),
    }));
  let bottom = box.bottom;
  for (let i = 0; i < copy.length; i++) {
    const top = bottom - box.height;
    const hit = copy.filter((b) => b.x < box.x + box.width && box.x < b.right && b.y < bottom && top < b.bottom);
    if (hit.length === 0) return bottom;
    const above = Math.min(...hit.map((b) => b.y)) - gap;
    if (above - box.height < safe.y) return box.bottom;
    bottom = above;
  }
  return bottom;
}

/** A new disclosure layer for `image`, bottom-aligned in the safe area, in brand body type. */
export function createDisclosureLayer(
  doc: SceneDocument,
  image: ImageLayer,
  asset: Asset,
  kit: BrandKit,
  measure: MeasureText = estimateTextWidth,
): DisclosureLayer {
  const text = photoDisclosureText(asset) ?? "";
  const body = kit.typography.body;
  // Share the position/style of the transition partner's disclosure so they hand over in
  // place; disclosures of unrelated photos (on screen together) stack above each other.
  const { photo1, photo2 } = photoPair(doc);
  const partnerFrame = image.id === photo1?.id ? photo2 : image.id === photo2?.id ? photo1 : undefined;
  const partner = partnerFrame ? disclosureLayersFor(doc, partnerFrame.id)[0] : undefined;
  const others = doc.layers.filter((l) => isDisclosureLayer(l) && l.disclosure.imageLayerId !== partnerFrame?.id);
  const safe = safeArea(doc);
  const style = partner
    ? {
        fontFamily: partner.fontFamily,
        fontSize: partner.fontSize,
        fontWeight: partner.fontWeight,
        letterSpacing: partner.letterSpacing,
        lineHeight: partner.lineHeight,
        color: partner.color,
        align: partner.align,
      }
    : {
        fontFamily: body.fontFamily,
        fontSize: defaultFontSize(doc),
        fontWeight: Math.min(body.fontWeight, 500),
        letterSpacing: 0,
        lineHeight: 1.3,
        color: kit.colors.text,
        align: "center" as const,
      };
  const width = partner?.width ?? safe.width;
  const height = Math.ceil(Math.max(style.fontSize * style.lineHeight, textBlockHeight(text, width, style, measure)));
  const x = partner?.x ?? safe.x;
  const gap = Math.round(style.fontSize * 0.5);
  const stackTop = others.length ? Math.min(...others.map((l) => l.y)) - gap : null;
  let bottom = partner ? partner.y + partner.height : (stackTop ?? safe.y + safe.height);
  if (!partner) bottom = clearOfCopy(doc, { x, width, height, bottom }, gap, measure);
  return makeLayer<TextLayer>({
    type: "text",
    name: `Disclosure — ${assetLabel(asset).replace(/\.[^.]+$/, "")}`.slice(0, 80),
    role: "disclosure",
    text,
    ...style,
    x,
    y: Math.round(bottom - height),
    width,
    height,
    motion: staticMotion(),
    visibility: { mode: "linkedPhoto", startMs: 0, endMs: null },
    disclosure: { assetId: asset.id, imageLayerId: image.id },
  }) as DisclosureLayer;
}

/**
 * Adds the photo's disclosure layer, or relinks the existing one — never a duplicate.
 * An existing box grows (keeping its bottom edge) when the wording no longer fits; it
 * never shrinks, so a deliberately roomy box is left alone. Returns `doc` unchanged
 * when nothing needs to change.
 */
export function ensureDisclosureLayer(
  doc: SceneDocument,
  imageLayerId: string,
  asset: Asset,
  kit: BrandKit,
  measure: MeasureText = estimateTextWidth,
): SceneDocument {
  const image = doc.layers.find((l): l is ImageLayer => l.id === imageLayerId && l.type === "image");
  if (!image) return doc;
  const existing = disclosureLayersFor(doc, imageLayerId);
  if (existing.length > 0) {
    const [keep, ...duplicates] = existing;
    const text = photoDisclosureText(asset) ?? keep.text;
    const needed = Math.ceil(textBlockHeight(text, keep.width, keep, measure));
    const height = Math.max(keep.height, needed);
    const unchanged =
      duplicates.length === 0 && keep.text === text && keep.disclosure.assetId === asset.id && height === keep.height;
    if (unchanged) return doc;
    const updated: DisclosureLayer = {
      ...keep,
      text,
      disclosure: { assetId: asset.id, imageLayerId },
      height,
      y: Math.round(keep.y + keep.height - height),
    };
    return {
      ...doc,
      layers: doc.layers
        .filter((l) => !duplicates.some((d) => d.id === l.id))
        .map((l) => (l.id === keep.id ? updated : l)),
    };
  }
  return { ...doc, layers: [...doc.layers, createDisclosureLayer(doc, image, asset, kit, measure)] };
}

/** Turns disclosure layers into ordinary text (kept on screen with their last wording). */
export function detachDisclosures(doc: SceneDocument, layerIds: string[], assets: AssetLookup): SceneDocument {
  return {
    ...doc,
    layers: doc.layers.map((l) =>
      layerIds.includes(l.id) && isDisclosureLayer(l)
        ? ({
            ...l,
            text: resolveLayerText(l, assets) || l.text,
            role: undefined,
            disclosure: null,
            visibility: { mode: "always", startMs: 0, endMs: null },
          } as TextLayer)
        : l,
    ),
  };
}

export function removeLayers(doc: SceneDocument, layerIds: string[]): SceneDocument {
  return { ...doc, layers: doc.layers.filter((l) => !layerIds.includes(l.id)) };
}

// ------------------------------------------------------------------ photo changes

/** "apply" does what the plan describes; the alternatives keep or skip the disclosure. */
export type DisclosureDecision = "apply" | "skip" | "keepAsText";

export interface PhotoChangePlan {
  /** Effect of "apply" on the frame's disclosure. */
  change: "none" | "add" | "relink" | "remove";
  /** Shown before the change; null means no question is needed. */
  prompt: null | {
    title: string;
    message: string;
    applyLabel: string;
    alternatives: { decision: Exclude<DisclosureDecision, "apply">; label: string }[];
  };
}

const quote = (asset: Asset) => `“${assetLabel(asset)}”`;

/**
 * What changing the photo in a frame (replace, remove, reassign) means for its
 * disclosure, and whether to ask first. `imageLayerId` is null for a brand-new frame.
 */
export function planPhotoChange(
  doc: SceneDocument,
  imageLayerId: string | null,
  newAsset: Asset | null,
  assets: AssetLookup,
): PhotoChangePlan {
  const image = imageLayerId
    ? doc.layers.find((l): l is ImageLayer => l.id === imageLayerId && l.type === "image")
    : undefined;
  const previousAssetId = image?.assetId ?? null;
  if (newAsset && previousAssetId === newAsset.id) return { change: "none", prompt: null };
  const linked = image ? disclosureLayersFor(doc, image.id) : [];
  const required = requiresDisclosure(newAsset);
  const previous = previousAssetId ? assets.get(previousAssetId) : undefined;

  if (linked.length > 0 && newAsset && required) {
    return {
      change: "relink",
      prompt: {
        title: "Update the disclosure?",
        message: `${quote(newAsset)} has its own disclosure. The disclosure layer in this scene will show the new photo’s wording; its position and style stay the same.`,
        applyLabel: "Replace photo & update disclosure",
        alternatives: [{ decision: "keepAsText", label: "Replace photo, keep old wording as plain text" }],
      },
    };
  }
  if (linked.length > 0) {
    return {
      change: "remove",
      prompt: {
        title: newAsset ? "Remove the old disclosure?" : "Remove the disclosure too?",
        message: newAsset
          ? `${quote(newAsset)} doesn’t require a disclosure. The disclosure layer here belongs to the previous photo${previous ? ` (${quote(previous)})` : ""}.`
          : `This frame’s disclosure layer belongs to the photo you’re removing${previous ? ` (${quote(previous)})` : ""}.`,
        applyLabel: newAsset ? "Replace photo & remove disclosure" : "Remove photo & disclosure",
        alternatives: [{ decision: "keepAsText", label: "Keep the disclosure as plain text" }],
      },
    };
  }
  if (newAsset && required) {
    // A new frame always gets its disclosure; replacing a photo asks first.
    return {
      change: "add",
      prompt: previousAssetId
        ? {
            title: "Add a disclosure?",
            message: `${quote(newAsset)} requires a disclosure. A disclosure layer will be added to this scene in the safe area, using brand typography.`,
            applyLabel: "Replace photo & add disclosure",
            alternatives: [{ decision: "skip", label: "Replace without it (export will warn)" }],
          }
        : null,
    };
  }
  return { change: "none", prompt: null };
}

/** Applies the disclosure side of a photo change. `doc` already has the new photo. */
export function applyDisclosureDecision(
  doc: SceneDocument,
  imageLayerId: string,
  plan: PhotoChangePlan,
  decision: DisclosureDecision,
  assets: AssetLookup,
  kit: BrandKit,
  measure?: MeasureText,
): SceneDocument {
  const linked = disclosureLayersFor(doc, imageLayerId).map((l) => l.id);
  if (decision === "skip" || plan.change === "none") return doc;
  if (decision === "keepAsText") return detachDisclosures(doc, linked, assets);
  if (plan.change === "remove") return removeLayers(doc, linked);
  const image = doc.layers.find((l): l is ImageLayer => l.id === imageLayerId && l.type === "image");
  const asset = image?.assetId ? assets.get(image.assetId) : undefined;
  return asset ? ensureDisclosureLayer(doc, imageLayerId, asset, kit, measure) : doc;
}

/** Deleting a photo frame: ask what happens to its disclosure. */
export function planLayerRemoval(doc: SceneDocument, layerId: string): PhotoChangePlan {
  const linked = disclosureLayersFor(doc, layerId);
  if (linked.length === 0) return { change: "none", prompt: null };
  return {
    change: "remove",
    prompt: {
      title: "Delete the disclosure too?",
      message: "This photo has a disclosure layer in this scene.",
      applyLabel: "Delete photo & disclosure",
      alternatives: [{ decision: "keepAsText", label: "Delete photo, keep disclosure as plain text" }],
    },
  };
}

/**
 * After a photo's disclosure setting changes in the library: add the missing layers
 * where it's now required, or remove its layers where it no longer is.
 */
export function syncDisclosuresForAsset(
  doc: SceneDocument,
  asset: Asset,
  kit: BrandKit,
  measure?: MeasureText,
): { doc: SceneDocument; added: number; removed: number; changed: boolean } {
  let next = doc;
  let added = 0;
  let removed = 0;
  const frames = doc.layers.filter((l): l is ImageLayer => l.type === "image" && l.assetId === asset.id);
  for (const frame of frames) {
    const linked = disclosureLayersFor(next, frame.id);
    if (photoDisclosureText(asset)) {
      if (linked.length === 0) added++;
      next = ensureDisclosureLayer(next, frame.id, asset, kit, measure);
    } else if (!requiresDisclosure(asset) && linked.length > 0) {
      removed += linked.length;
      next = removeLayers(
        next,
        linked.map((l) => l.id),
      );
    }
  }
  return { doc: next, added, removed, changed: next !== doc };
}

// ------------------------------------------------------------------ quality checks

export type DisclosureFix = "add" | "show" | "fitHeight" | "moveIntoSafeArea" | "remove" | "editText";

export interface DisclosureIssue {
  severity: "error" | "warning";
  message: string;
  /** Disclosure layer concerned (if any). */
  layerId?: string;
  /** Photo frame concerned (if any). */
  imageLayerId?: string;
  fix?: DisclosureFix;
}

/**
 * Pre-export (and live editor) review. Errors mean a required disclosure would be
 * missing, hidden, unreadable or clipped in the output; warnings are worth checking.
 */
export function disclosureIssues(
  doc: SceneDocument,
  assets: AssetLookup,
  measure: MeasureText = estimateTextWidth,
): DisclosureIssue[] {
  const issues: DisclosureIssue[] = [];
  const timings = computeSceneTimings(doc.layers, doc.durationMs);
  const safe = safeArea(doc);
  const minSize = minDisclosureFontSize(doc);

  for (const image of doc.layers) {
    if (image.type !== "image" || !image.assetId || !image.visible || image.opacity <= 0) continue;
    const asset = assets.get(image.assetId);
    if (!requiresDisclosure(asset)) continue;
    const name = quote(asset!);
    if (!photoDisclosureText(asset)) {
      issues.push({
        severity: "error",
        imageLayerId: image.id,
        message: `${name} is marked as requiring a disclosure but has no wording. Add it in the project photo library.`,
        fix: "editText",
      });
      continue;
    }
    const photoOnScreen = photoWindow(doc, image.id, timings);
    if (photoOnScreen.to <= photoOnScreen.from) continue;
    const linked = disclosureLayersFor(doc, image.id);
    if (linked.length === 0) {
      issues.push({
        severity: "error",
        imageLayerId: image.id,
        message: `${name} requires a disclosure, but this scene has no disclosure layer for it.`,
        fix: "add",
      });
      continue;
    }
    const shown = linked.filter((l) => l.visible && l.opacity >= 0.1);
    if (shown.length === 0) {
      issues.push({
        severity: "error",
        imageLayerId: image.id,
        layerId: linked[0].id,
        message: `The disclosure for ${name} is hidden.`,
        fix: "show",
      });
      continue;
    }
    const covers = shown.some((l) => {
      const w = layerWindow(doc, l, timings);
      return w.from <= photoOnScreen.from && w.to >= Math.min(photoOnScreen.to, doc.durationMs);
    });
    if (!covers) {
      issues.push({
        severity: "error",
        imageLayerId: image.id,
        layerId: shown[0].id,
        message: `The disclosure for ${name} isn’t on screen for the whole time the photo is. Set its visibility to follow the photo.`,
      });
    }
  }

  for (const layer of doc.layers) {
    if (!isDisclosureLayer(layer)) continue;
    const image = doc.layers.find((l) => l.id === layer.disclosure.imageLayerId && l.type === "image") as
      ImageLayer | undefined;
    const asset = assets.get(layer.disclosure.assetId);
    if (!image) {
      issues.push({
        severity: "warning",
        layerId: layer.id,
        message: `“${layer.name}” belongs to a photo frame that no longer exists.`,
        fix: "remove",
      });
      continue;
    }
    if (asset && image.assetId !== asset.id) {
      issues.push({
        severity: "warning",
        layerId: layer.id,
        message: `“${layer.name}” belongs to a photo that is no longer in its frame.`,
        fix: "remove",
      });
      continue;
    }
    if (asset && !requiresDisclosure(asset)) {
      issues.push({
        severity: "warning",
        layerId: layer.id,
        message: `${quote(asset)} no longer requires a disclosure; “${layer.name}” shows nothing.`,
        fix: "remove",
      });
      continue;
    }
    if (!layer.visible || layer.opacity < 0.1) continue; // reported above with its photo
    const text = resolveLayerText(layer, assets);
    if (!text) continue;
    const textHeight = textBlockHeight(text, layer.width, layer, measure);
    const bottom = layer.y + Math.max(layer.height, textHeight);
    if (layer.x < 0 || layer.y < 0 || layer.x + layer.width > doc.width || bottom > doc.height) {
      issues.push({
        severity: "error",
        layerId: layer.id,
        message: `“${layer.name}” extends past the edge of the scene and will be clipped.`,
        fix: "moveIntoSafeArea",
      });
    } else if (
      layer.x < safe.x - 0.5 ||
      layer.y < safe.y - 0.5 ||
      layer.x + layer.width > safe.x + safe.width + 0.5 ||
      bottom > safe.y + safe.height + 0.5
    ) {
      issues.push({
        severity: "warning",
        layerId: layer.id,
        message: `“${layer.name}” is outside the safe area, where platform buttons and captions may cover it.`,
        fix: "moveIntoSafeArea",
      });
    }
    if (textHeight > layer.height + layer.fontSize * 0.25) {
      issues.push({
        severity: "error",
        layerId: layer.id,
        message: `“${layer.name}” has more text than its box holds; the overflow may be cut off or overlap other content.`,
        fix: "fitHeight",
      });
    }
    // Other text on screen at the same time over the disclosure hurts legibility.
    const ownWindow = layerWindow(doc, layer, timings);
    const box = { x: layer.x, y: layer.y, width: layer.width, height: Math.max(layer.height, textHeight) };
    const overlapping = doc.layers.filter((other) => {
      if (other.id === layer.id || other.type !== "text" || !other.visible || other.opacity < 0.1) return false;
      const w = layerWindow(doc, other, timings);
      if (Math.max(w.from, ownWindow.from) >= Math.min(w.to, ownWindow.to)) return false;
      const otherText = resolveLayerText(other, assets);
      if (!otherText) return false;
      const otherHeight = Math.max(other.height, textBlockHeight(otherText, other.width, other, measure));
      return (
        box.x < other.x + other.width &&
        other.x < box.x + box.width &&
        box.y < other.y + otherHeight &&
        other.y < box.y + box.height
      );
    });
    if (overlapping.length > 0) {
      issues.push({
        severity: "warning",
        layerId: layer.id,
        message: `“${layer.name}” overlaps ${overlapping.map((o) => `“${o.name}”`).join(", ")}; overlapping text can make the disclosure hard to read.`,
      });
    }
    if (layer.fontSize < minSize) {
      issues.push({
        severity: "warning",
        layerId: layer.id,
        message: `“${layer.name}” is ${layer.fontSize}px — below the ${minSize}px minimum for legible disclosures at this size.`,
      });
    }
  }
  return issues;
}

/** Quick fix: grow/shrink the box to fit the wrapped text (keeps the bottom edge). */
export function fitDisclosureHeight(
  doc: SceneDocument,
  layerId: string,
  assets: AssetLookup,
  measure: MeasureText = estimateTextWidth,
): SceneDocument {
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (l.id !== layerId || l.type !== "text") return l;
      const text = resolveLayerText(l, assets);
      const height = Math.ceil(Math.max(l.fontSize * l.lineHeight, textBlockHeight(text, l.width, l, measure)));
      return { ...l, y: Math.round(l.y + l.height - height), height };
    }),
  };
}

/** Quick fix: move (and if needed narrow) the box so the text sits inside the safe area. */
export function moveIntoSafeArea(
  doc: SceneDocument,
  layerId: string,
  assets: AssetLookup,
  measure: MeasureText = estimateTextWidth,
): SceneDocument {
  const safe = safeArea(doc);
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (l.id !== layerId || l.type !== "text") return l;
      const width = Math.min(l.width, safe.width);
      const text = resolveLayerText(l, assets);
      const height = Math.ceil(Math.max(l.height, textBlockHeight(text, width, l, measure)));
      const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
      const x = Math.round(clamp(l.x, safe.x, safe.x + safe.width - width));
      const y = Math.round(clamp(l.y, safe.y, safe.y + safe.height - height));
      const bottom = clearOfCopy(
        doc,
        { x, width, height, bottom: y + height },
        Math.round(l.fontSize * 0.5),
        measure,
        l.id,
      );
      return { ...l, width, height, rotation: 0, x, y: bottom - height };
    }),
  };
}
