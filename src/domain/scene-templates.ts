import type { BrandKit } from "./brand-kit";
import { buildLayoutLayers, type LayoutPresetId } from "./layout-presets";
import {
  makeLayer,
  SCENE_SCHEMA_VERSION,
  type SceneDocument,
  type SceneKind,
  type ShapeLayer,
  type TextLayer,
} from "./scene";

/** Production presets — users can change any scene's dimensions afterwards. */
export const DIMENSION_PRESETS = [
  { id: "vertical", name: "Vertical Scene", width: 1080, height: 1920 },
  { id: "square", name: "Square Feed", width: 1080, height: 1080 },
  { id: "outro", name: "Outro Motion", width: 1080, height: 1620 },
  { id: "cta", name: "CTA Image", width: 1080, height: 300 },
] as const;

export interface SceneTemplate {
  name: string;
  kind: SceneKind;
  document: SceneDocument;
}

function layoutScene(
  name: string,
  kind: SceneKind,
  size: { width: number; height: number },
  layout: LayoutPresetId,
  kit: BrandKit,
): SceneTemplate {
  const background = kit.colors.background;
  return {
    name,
    kind,
    document: {
      schemaVersion: SCENE_SCHEMA_VERSION,
      ...size,
      background,
      durationMs: 6000,
      layout,
      layers: buildLayoutLayers(layout, size, kit, background),
    },
  };
}

export function ctaDocument(kit: BrandKit): SceneDocument {
  const width = 1080;
  const height = 300;
  const buttonWidth = 460;
  const buttonHeight = 128;
  const buttonX = (width - buttonWidth) / 2;
  const buttonY = (height - buttonHeight) / 2;
  const style = kit.typography.cta;
  const textHeight = Math.ceil(style.fontSize * style.lineHeight);
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    width,
    height,
    background: kit.colors.background,
    durationMs: 6000,
    layers: [
      makeLayer<ShapeLayer>({
        type: "shape",
        name: "CTA button",
        role: "ctaButton",
        shape: "rect",
        fill: kit.cta.background,
        cornerRadius: kit.cta.cornerRadius,
        x: buttonX,
        y: buttonY,
        width: buttonWidth,
        height: buttonHeight,
      }),
      makeLayer<TextLayer>({
        type: "text",
        name: "CTA label",
        role: "cta",
        styleRef: "cta",
        text: kit.cta.label,
        ...style,
        color: kit.cta.textColor,
        align: "center",
        x: buttonX,
        y: buttonY + (buttonHeight - textHeight) / 2,
        width: buttonWidth,
        height: textHeight,
      }),
    ],
  };
}

/** The standard scene set created with every new model project. */
export function defaultProjectScenes(kit: BrandKit): SceneTemplate[] {
  const vertical = { width: 1080, height: 1920 };
  return [
    layoutScene("Intro", "intro", vertical, "fullBleedOverlay", kit),
    layoutScene("Exterior", "exterior", vertical, "imageTopTextBottom", kit),
    layoutScene("Interior", "interior", vertical, "textTopImageBottom", kit),
    layoutScene("Performance", "performance", vertical, "fullBleedOverlay", kit),
    layoutScene("Outro", "outro", { width: 1080, height: 1620 }, "imageTopTextBottom", kit),
    layoutScene("Square Feed", "feed", { width: 1080, height: 1080 }, "fullBleedOverlay", kit),
    { name: "CTA", kind: "cta", document: ctaDocument(kit) },
  ];
}
