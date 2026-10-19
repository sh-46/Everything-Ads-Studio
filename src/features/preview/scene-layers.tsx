import { createContext, useContext, useMemo, useState } from "react";
import { Img } from "remotion";
import type { Asset } from "@/domain/asset";
import { computeSceneTimings, evaluateMotion, IDENTITY_MOTION } from "@/domain/motion-engine";
import type { ImageLayer, Layer, LogoLayer, SceneDocument } from "@/domain/scene";
import {
  contentOriginCss,
  contentTransform,
  cornerRadius,
  gradientCss,
  imageRect,
  layerTransform,
  textStyle,
} from "./layer-style";

/**
 * Renders a scene document at time `timeMs` as positioned DOM in scene pixels. Used by
 * the Remotion compositions (preview now, MP4 later). Pure function of its props.
 */
/**
 * "preview": the in-app Player (shows a faint outline for empty frames, tolerates a
 * broken image). "render": final output — no helper outlines, and an image that fails
 * to load fails the render instead of silently disappearing.
 */
export const RenderModeContext = createContext<"preview" | "render">("preview");

export function SceneLayers({
  document: doc,
  assets,
  timeMs,
  offsetY = 0,
}: {
  document: SceneDocument;
  assets: Asset[];
  /** null renders the static, fully-entered layout (no motion). */
  timeMs: number | null;
  offsetY?: number;
}) {
  const timings = useMemo(() => computeSceneTimings(doc.layers, doc.durationMs), [doc.layers, doc.durationMs]);
  const assetsById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: offsetY,
        width: doc.width,
        height: doc.height,
        overflow: "hidden",
        background: doc.background,
      }}
    >
      {doc.layers.map((layer) => {
        if (!layer.visible) return null;
        const asset = "assetId" in layer && layer.assetId ? assetsById.get(layer.assetId) : undefined;
        const media = asset?.width && asset.height ? { width: asset.width, height: asset.height } : null;
        const m = timeMs === null ? IDENTITY_MOTION : evaluateMotion(layer, timings.get(layer.id), timeMs, media);
        const opacity = layer.opacity * m.opacity;
        if (opacity <= 0) return null;
        return (
          <div
            key={layer.id}
            data-layer-id={layer.id}
            data-layer-type={layer.type}
            data-layer-role={layer.role}
            style={{
              position: "absolute",
              left: layer.x,
              top: layer.y,
              width: layer.width,
              height: layer.height,
              transformOrigin: "0 0",
              transform: layerTransform(layer, m),
              opacity,
              overflow: layer.type === "text" ? "visible" : "hidden",
            }}
          >
            <LayerContent layer={layer} assetsById={assetsById} motion={m} />
          </div>
        );
      })}
    </div>
  );
}

function LayerContent({
  layer,
  assetsById,
  motion,
}: {
  layer: Layer;
  assetsById: Map<string, Asset>;
  motion: ReturnType<typeof evaluateMotion>;
}) {
  switch (layer.type) {
    case "text":
      return <p style={textStyle(layer)}>{layer.text}</p>;
    case "gradient":
      return <div style={{ width: "100%", height: "100%", background: gradientCss(layer.fill) }} />;
    case "shape":
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            background: layer.fill,
            borderRadius: layer.shape === "ellipse" ? "50%" : cornerRadius(layer),
          }}
        />
      );
    case "image":
      return <Media layer={layer} asset={layer.assetId ? assetsById.get(layer.assetId) : undefined} motion={motion} />;
    case "logo":
      return <Media layer={layer} asset={layer.assetId ? assetsById.get(layer.assetId) : undefined} motion={motion} />;
  }
}

function Media({
  layer,
  asset,
  motion,
}: {
  layer: ImageLayer | LogoLayer;
  asset: Asset | undefined;
  motion: ReturnType<typeof evaluateMotion>;
}) {
  const [failed, setFailed] = useState(false);
  const mode = useContext(RenderModeContext);
  if (!asset || failed) {
    // Empty frames are invisible in the final ad; a subtle outline helps while previewing.
    if (mode === "render") return null;
    return <div style={{ width: "100%", height: "100%", outline: "1px dashed rgba(255,255,255,0.15)" }} />;
  }
  const isLogo = layer.type === "logo";
  const rect = imageRect(
    asset,
    layer,
    isLogo ? "contain" : layer.fit,
    isLogo ? 0.5 : layer.focalX,
    isLogo ? 0.5 : layer.focalY,
    isLogo ? 1 : layer.zoom,
  );
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        // Focus point (frame px) when set; otherwise the frame center, as before.
        transformOrigin: contentOriginCss(motion),
        transform: contentTransform(motion),
      }}
    >
      <Img
        src={asset.url}
        alt=""
        onError={mode === "render" ? undefined : () => setFailed(true)}
        style={{
          position: "absolute",
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          maxWidth: "none",
        }}
      />
    </div>
  );
}
