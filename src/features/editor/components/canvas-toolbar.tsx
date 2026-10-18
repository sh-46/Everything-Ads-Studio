"use client";

import { Image as ImageIcon, Maximize, Minus, Pause, Play, Plus, Shapes, Square, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  makeLayer,
  type GradientLayer,
  type ImageLayer,
  type Layer,
  type ShapeLayer,
  type TextLayer,
} from "@/domain/scene";
import { useActiveScene, useEditorStore } from "../store/editor-store";

const ZOOM_STEPS = [0.1, 0.15, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2];

export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((z) => z > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? ZOOM_STEPS[0];
}

function ToolButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} disabled={disabled}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function AddLayerToolbar() {
  const scene = useActiveScene();
  const kit = useEditorStore((s) => s.kit);
  const addLayer = useEditorStore((s) => s.addLayer);
  if (!scene) return null;
  const { width: W, height: H } = scene.document;
  const s = W / 1080;

  const add = (layer: Layer) => addLayer(layer);
  const centered = (w: number, h: number) => ({
    x: Math.round((W - w) / 2),
    y: Math.round((H - h) / 2),
    width: w,
    height: h,
  });

  return (
    <div className="flex items-center gap-0.5" role="toolbar" aria-label="Add layer">
      <ToolButton
        label="Add text"
        onClick={() => {
          const style = kit.typography.headline;
          const fontSize = Math.round(style.fontSize * s);
          add(
            makeLayer<TextLayer>({
              type: "text",
              name: "Text",
              styleRef: "headline",
              text: "New headline",
              ...style,
              fontSize,
              align: "left",
              ...centered(Math.round(W * 0.8), Math.ceil(fontSize * style.lineHeight)),
            }),
          );
        }}
      >
        <Type />
      </ToolButton>
      <ToolButton
        label="Add image frame"
        onClick={() =>
          add(
            makeLayer<ImageLayer>({
              type: "image",
              name: "Image",
              assetId: null,
              fit: "cover",
              focalX: 0.5,
              focalY: 0.5,
              zoom: 1,
              ...centered(Math.round(W * 0.6), Math.round(Math.min(H, W) * 0.6)),
            }),
          )
        }
      >
        <ImageIcon />
      </ToolButton>
      <ToolButton
        label="Add gradient"
        onClick={() =>
          add(
            makeLayer<GradientLayer>({
              type: "gradient",
              name: "Gradient",
              fill: structuredClone(kit.scrim),
              x: 0,
              y: Math.round(H * 0.5),
              width: W,
              height: H - Math.round(H * 0.5),
            }),
          )
        }
      >
        <Square />
      </ToolButton>
      <ToolButton
        label="Add shape"
        onClick={() =>
          add(
            makeLayer<ShapeLayer>({
              type: "shape",
              name: "Shape",
              shape: "rect",
              fill: kit.colors.accent,
              cornerRadius: 0,
              ...centered(Math.round(240 * s), Math.round(240 * s)),
            }),
          )
        }
      >
        <Shapes />
      </ToolButton>
    </div>
  );
}

export function ZoomControls() {
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const current = typeof zoom === "number" ? zoom : null;
  return (
    <div className="flex items-center gap-0.5">
      <ToolButton label="Zoom out (⌘−)" onClick={() => setZoom(stepZoom(current ?? 0.33, -1))}>
        <Minus />
      </ToolButton>
      <span className="text-muted-foreground w-12 text-center text-xs tabular-nums">
        {current ? `${Math.round(current * 100)}%` : "Fit"}
      </span>
      <ToolButton label="Zoom in (⌘+)" onClick={() => setZoom(stepZoom(current ?? 0.33, 1))}>
        <Plus />
      </ToolButton>
      <ToolButton label="Fit to screen (⌘0)" onClick={() => setZoom("fit")}>
        <Maximize />
      </ToolButton>
    </div>
  );
}

/** Playback needs the Phase 3 motion engine; shown disabled with its real status. */
export function PlaybackControls() {
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <ToolButton label="Play (available in Phase 3: Motion)" disabled>
        <Play />
      </ToolButton>
      <ToolButton label="Pause (available in Phase 3: Motion)" disabled>
        <Pause />
      </ToolButton>
      <span>Playback arrives with the motion engine</span>
    </div>
  );
}
