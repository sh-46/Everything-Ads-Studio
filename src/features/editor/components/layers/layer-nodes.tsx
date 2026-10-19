"use client";

import { Ellipse, Image as KonvaImage, Rect, Text } from "react-konva";
import { hexToRgba } from "@/domain/color";
import { resolveLayerText } from "@/domain/disclosures";
import { fontStack } from "@/domain/fonts";
import { linearGradientPoints, radialGradientRadius, visibleImageRegion } from "@/domain/geometry";
import type { GradientLayer, ImageLayer, LogoLayer, ShapeLayer, TextLayer } from "@/domain/scene";
import { useImageElement } from "../../hooks/use-image-element";
import { useEditorStore } from "../../store/editor-store";

/**
 * Each node draws its layer's content at (0,0) inside a parent Group that carries the
 * layer transform. All pixel math comes from `@/domain/geometry` so Remotion can match it.
 */

export function TextNode({ layer }: { layer: TextLayer }) {
  // Remount when brand fonts finish loading so Konva re-measures with the real font.
  const fontsVersion = useEditorStore((s) => s.fontsVersion);
  // Disclosure layers show their photo's current wording from the library.
  const text = useEditorStore((s) => {
    if (!layer.disclosure) return layer.text;
    const asset = s.assets.find((a) => a.id === layer.disclosure!.assetId);
    return resolveLayerText(layer, new Map(asset ? [[asset.id, asset]] : []));
  });
  return (
    <>
      {/* Hit/bounds box: the stored text box, independent of how much text overflows. */}
      <Rect width={layer.width} height={layer.height} fill="transparent" />
      <Text
        key={fontsVersion}
        text={text}
        width={layer.width}
        fontFamily={fontStack(layer.fontFamily)}
        fontSize={layer.fontSize}
        fontStyle={String(layer.fontWeight)}
        letterSpacing={layer.letterSpacing}
        lineHeight={layer.lineHeight}
        fill={layer.color}
        align={layer.align}
        wrap="word"
        listening={false}
      />
    </>
  );
}

const PLACEHOLDER_FILL = "#26262B";

function PhotoContent({
  layer,
  fit,
  focalX,
  focalY,
  zoom,
  placeholder,
}: {
  layer: ImageLayer | LogoLayer;
  fit: ImageLayer["fit"];
  focalX: number;
  focalY: number;
  zoom: number;
  placeholder: string;
}) {
  const asset = useEditorStore((s) => (layer.assetId ? s.assets.find((a) => a.id === layer.assetId) : undefined));
  const { status, image } = useImageElement(asset ? `${asset.id}|${asset.url}` : null, asset?.url ?? null);
  const frame = { width: layer.width, height: layer.height };

  if (status !== "loaded" || !image) {
    const label =
      status === "loading"
        ? "Loading photo…"
        : status === "error"
          ? "Photo failed to load"
          : layer.assetId && !asset
            ? "Photo unavailable"
            : placeholder;
    return (
      <>
        <Rect {...frame} fill={PLACEHOLDER_FILL} />
        <Text
          {...frame}
          text={label}
          align="center"
          verticalAlign="middle"
          fontSize={Math.max(14, Math.min(36, layer.width / 18))}
          fontFamily="Helvetica Neue"
          fill="#8A8A93"
          listening={false}
        />
      </>
    );
  }

  // SVGs without intrinsic size report 0; fall back to the size recorded at upload.
  const natural = {
    width: image.naturalWidth || asset?.width || layer.width,
    height: image.naturalHeight || asset?.height || layer.height,
  };
  const region = visibleImageRegion(natural, frame, fit, focalX, focalY, zoom);
  return (
    <>
      <Rect {...frame} fill="transparent" />
      {region && (
        <KonvaImage
          image={image}
          x={region.dest.x}
          y={region.dest.y}
          width={region.dest.width}
          height={region.dest.height}
          crop={region.source}
          listening={false}
        />
      )}
    </>
  );
}

export function ImageNode({ layer }: { layer: ImageLayer }) {
  return (
    <PhotoContent
      layer={layer}
      fit={layer.fit}
      focalX={layer.focalX}
      focalY={layer.focalY}
      zoom={layer.zoom}
      placeholder="Select a photo from Assets"
    />
  );
}

export function LogoNode({ layer }: { layer: LogoLayer }) {
  return <PhotoContent layer={layer} fit="contain" focalX={0.5} focalY={0.5} zoom={1} placeholder="Logo" />;
}

export function GradientNode({ layer }: { layer: GradientLayer }) {
  const box = { width: layer.width, height: layer.height };
  const stops = [...layer.fill.stops]
    .sort((a, b) => a.offset - b.offset)
    .flatMap((s) => [s.offset, hexToRgba(s.color, s.opacity)]);

  if (layer.fill.gradientType === "radial") {
    const center = { x: box.width / 2, y: box.height / 2 };
    return (
      <Rect
        {...box}
        fillRadialGradientStartPoint={center}
        fillRadialGradientEndPoint={center}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndRadius={radialGradientRadius(box)}
        fillRadialGradientColorStops={stops}
      />
    );
  }
  const { start, end } = linearGradientPoints(layer.fill.angle, box);
  return (
    <Rect
      {...box}
      fillLinearGradientStartPoint={start}
      fillLinearGradientEndPoint={end}
      fillLinearGradientColorStops={stops}
    />
  );
}

export function ShapeNode({ layer }: { layer: ShapeLayer }) {
  if (layer.shape === "ellipse") {
    return (
      <>
        <Rect width={layer.width} height={layer.height} fill="transparent" />
        <Ellipse
          x={layer.width / 2}
          y={layer.height / 2}
          radiusX={layer.width / 2}
          radiusY={layer.height / 2}
          fill={layer.fill}
          listening={false}
        />
      </>
    );
  }
  return <Rect width={layer.width} height={layer.height} fill={layer.fill} cornerRadius={layer.cornerRadius} />;
}
