import type { BrandKit } from "./brand-kit";
import { photoMotion, textMotion } from "./brand-motion";
import type { MotionConfig } from "./motion";
import type { GradientFill } from "./gradient";
import type { Rect, Size } from "./geometry";
import {
  makeLayer,
  type GradientLayer,
  type ImageLayer,
  type Layer,
  type LayerRole,
  type SceneDocument,
  type TextLayer,
} from "./scene";

export const LAYOUT_PRESETS = [
  { id: "textTopImageBottom", name: "Text top / Image bottom" },
  { id: "imageTopTextBottom", name: "Image top / Text bottom" },
  { id: "fullBleedOverlay", name: "Full-bleed image / Text overlay" },
  { id: "twoImageSplit", name: "Two-image split" },
  { id: "sequentialTwoImage", name: "Sequential two-image" },
] as const;

export type LayoutPresetId = (typeof LAYOUT_PRESETS)[number]["id"];

export const LAYOUT_PRESET_IDS = LAYOUT_PRESETS.map((p) => p.id) as [LayoutPresetId, ...LayoutPresetId[]];

/** Content pulled out of an existing scene so a new layout keeps the user's work. */
type CarriedContent = Partial<Record<LayerRole, Layer>>;

interface Ctx {
  size: Size;
  kit: BrandKit;
  background: string;
  carried: CarriedContent;
  /** Scale from the 1080-wide reference design. */
  s: number;
  margin: number;
}

function imageLayer(
  ctx: Ctx,
  role: "primaryImage" | "secondaryImage",
  rect: Rect,
  name: string,
  motion: MotionConfig = photoMotion(ctx.kit),
): ImageLayer {
  const prev = ctx.carried[role];
  const base = makeLayer<ImageLayer>({
    motion,
    type: "image",
    name,
    role,
    assetId: null,
    fit: "cover",
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    ...rect,
  });
  if (prev?.type !== "image") return base;
  return {
    ...base,
    id: prev.id,
    name: prev.name,
    assetId: prev.assetId,
    fit: prev.fit,
    focalX: prev.focalX,
    focalY: prev.focalY,
    zoom: prev.zoom,
    motionFocus: prev.motionFocus,
    opacity: prev.opacity,
    visible: prev.visible,
    motion: prev.motion,
  };
}

function textLayer(ctx: Ctx, role: "headline" | "subtitle", rect: Rect, align: TextLayer["align"]): TextLayer {
  const style = ctx.kit.typography[role];
  const prev = ctx.carried[role];
  const base = makeLayer<TextLayer>({
    // Headline enters shortly after the scene starts; the subtitle follows it.
    motion: role === "headline" ? textMotion(ctx.kit, "sceneStart", 300) : textMotion(ctx.kit, "withPrevious", 250),
    type: "text",
    name: role === "headline" ? "Headline" : "Subtitle",
    role,
    styleRef: role,
    text: role === "headline" ? "Headline" : "Supporting subtitle",
    ...style,
    fontSize: Math.round(style.fontSize * ctx.s),
    align,
    ...rect,
  });
  if (prev?.type !== "text") return base;
  // Keep the user's copy and typography; the layout only decides geometry and alignment.
  return { ...prev, ...rect, rotation: 0, align };
}

function scrimLayer(ctx: Ctx, rect: Rect, fill: GradientFill): GradientLayer {
  const prev = ctx.carried.scrim;
  return makeLayer<GradientLayer>({
    type: "gradient",
    name: "Gradient",
    role: "scrim",
    fill,
    ...rect,
    id: prev?.id,
  });
}

/** Linear fade into the scene background, used where photography meets a solid area. */
function backgroundFade(ctx: Ctx, angle: number): GradientFill {
  return {
    gradientType: "linear",
    angle,
    stops: [
      { offset: 0, color: ctx.background, opacity: 0 },
      { offset: 1, color: ctx.background, opacity: 1 },
    ],
  };
}

function textHeights(ctx: Ctx) {
  const h = ctx.kit.typography.headline;
  const sub = ctx.kit.typography.subtitle;
  return {
    headline: Math.ceil(h.fontSize * ctx.s * h.lineHeight * 2),
    subtitle: Math.ceil(sub.fontSize * ctx.s * sub.lineHeight * 2),
    gap: Math.round(20 * ctx.s),
  };
}

/** Headline + subtitle stacked, anchored at `top` or ending at `bottom`. */
function textBlock(ctx: Ctx, anchor: { top: number } | { bottom: number }, align: TextLayer["align"]): Layer[] {
  const { headline, subtitle, gap } = textHeights(ctx);
  const width = ctx.size.width - ctx.margin * 2;
  const top = "top" in anchor ? anchor.top : anchor.bottom - (headline + gap + subtitle);
  return [
    textLayer(ctx, "headline", { x: ctx.margin, y: top, width, height: headline }, align),
    textLayer(ctx, "subtitle", { x: ctx.margin, y: top + headline + gap, width, height: subtitle }, align),
  ];
}

function build(presetId: LayoutPresetId, ctx: Ctx): Layer[] {
  const { width: W, height: H } = ctx.size;
  switch (presetId) {
    case "textTopImageBottom": {
      const imageTop = Math.round(H * 0.38);
      return [
        imageLayer(ctx, "primaryImage", { x: 0, y: imageTop, width: W, height: H - imageTop }, "Photo"),
        scrimLayer(ctx, { x: 0, y: imageTop, width: W, height: Math.round(H * 0.18) }, backgroundFade(ctx, 0)),
        ...textBlock(ctx, { top: Math.round(H * 0.08) }, "left"),
      ];
    }
    case "imageTopTextBottom": {
      const imageHeight = Math.round(H * 0.6);
      const fadeHeight = Math.round(H * 0.16);
      return [
        imageLayer(ctx, "primaryImage", { x: 0, y: 0, width: W, height: imageHeight }, "Photo"),
        scrimLayer(ctx, { x: 0, y: imageHeight - fadeHeight, width: W, height: fadeHeight }, backgroundFade(ctx, 180)),
        ...textBlock(ctx, { top: imageHeight + Math.round(H * 0.04) }, "left"),
      ];
    }
    case "fullBleedOverlay":
      return [
        imageLayer(ctx, "primaryImage", { x: 0, y: 0, width: W, height: H }, "Photo"),
        scrimLayer(ctx, { x: 0, y: Math.round(H * 0.45), width: W, height: H - Math.round(H * 0.45) }, ctx.kit.scrim),
        ...textBlock(ctx, { bottom: H - ctx.margin * 1.5 }, "left"),
      ];
    case "twoImageSplit": {
      const half = Math.round(H / 2);
      return [
        imageLayer(ctx, "primaryImage", { x: 0, y: 0, width: W, height: half }, "Photo 1"),
        imageLayer(ctx, "secondaryImage", { x: 0, y: half, width: W, height: H - half }, "Photo 2"),
        scrimLayer(ctx, { x: 0, y: 0, width: W, height: Math.round(H * 0.3) }, { ...ctx.kit.scrim, angle: 0 }),
        ...textBlock(ctx, { top: ctx.margin }, "left"),
      ];
    }
    case "sequentialTwoImage":
      // Photo 2 sits above Photo 1; the Phase 3 image transition reveals it over time.
      return [
        imageLayer(ctx, "primaryImage", { x: 0, y: 0, width: W, height: H }, "Photo 1"),
        imageLayer(ctx, "secondaryImage", { x: 0, y: 0, width: W, height: H }, "Photo 2 (after Photo 1)", {
          ...photoMotion(ctx.kit),
          delayMs: 2600,
          transition: { preset: "crossfade", durationMs: 800, easing: "easeInOut", direction: "left" },
        }),
        scrimLayer(ctx, { x: 0, y: Math.round(H * 0.45), width: W, height: H - Math.round(H * 0.45) }, ctx.kit.scrim),
        ...textBlock(ctx, { bottom: H - ctx.margin * 1.5 }, "left"),
      ];
  }
}

export function buildLayoutLayers(
  presetId: LayoutPresetId,
  size: Size,
  kit: BrandKit,
  background: string,
  carried: CarriedContent = {},
): Layer[] {
  const s = size.width / 1080;
  return build(presetId, { size, kit, background, carried, s, margin: Math.round(80 * s) });
}

/**
 * Re-lays out a scene. Layers with a role the preset uses are replaced (keeping their
 * content); every other layer is kept unchanged on top, so user additions survive.
 */
export function applyLayoutPreset(doc: SceneDocument, presetId: LayoutPresetId, kit: BrandKit): SceneDocument {
  const carried: CarriedContent = {};
  for (const layer of doc.layers) {
    if (layer.role && !carried[layer.role]) carried[layer.role] = layer;
  }
  const layoutLayers = buildLayoutLayers(presetId, doc, kit, doc.background, carried);
  const usedRoles = new Set(layoutLayers.map((l) => l.role));
  const extras = doc.layers.filter((l) => !l.role || !usedRoles.has(l.role));
  // Carried content for roles the new preset doesn't use (e.g. Photo 2) stays as an extra.
  return { ...doc, layout: presetId, layers: [...layoutLayers, ...extras] };
}
