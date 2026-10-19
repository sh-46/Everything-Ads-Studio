"use client";

import {
  FolderOpen,
  Image as ImageIcon,
  Maximize,
  Minus,
  Plus,
  Shapes,
  Sparkles,
  Square,
  SquareDashed,
  Type,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ACCEPT } from "@/domain/asset";
import { photoMotion, textMotion } from "@/domain/brand-motion";
import { AssetPickerDialog } from "@/features/assets/components/asset-picker-dialog";
import { UploadQueue } from "@/features/assets/components/upload-widgets";
import { useUploader } from "@/features/assets/components/use-uploader";
import type { UploadTarget } from "@/features/assets/upload";
import { useInsertMedia } from "../hooks/use-insert-media";
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
              motion: textMotion(kit),
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
      <AddImageMenu />
      <AddLogoButton />
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

/**
 * Add Image: upload straight from the computer (added to the project library and placed
 * on the canvas at its own aspect ratio), choose from the library, or add an empty frame.
 */
function AddImageMenu() {
  const target = useEditorStore((s) => s.uploadTarget) as UploadTarget;
  const assets = useEditorStore((s) => s.assets);
  const addAsset = useEditorStore((s) => s.addAsset);
  const addLayer = useEditorStore((s) => s.addLayer);
  const { insertPhoto } = useInsertMedia();
  const { items, upload, dismiss } = useUploader(target);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const addEmptyFrame = () => {
    const { scenes, activeSceneId, kit } = useEditorStore.getState();
    const doc = scenes[activeSceneId]?.document;
    if (!doc) return;
    const width = Math.round(doc.width * 0.6);
    const height = Math.round(Math.min(doc.height, doc.width) * 0.6);
    addLayer(
      makeLayer<ImageLayer>({
        type: "image",
        name: "Image",
        assetId: null,
        fit: "cover",
        focalX: 0.5,
        focalY: 0.5,
        zoom: 1,
        motion: photoMotion(kit),
        x: Math.round((doc.width - width) / 2),
        y: Math.round((doc.height - height) / 2),
        width,
        height,
      }),
    );
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.photo}
        multiple
        className="sr-only"
        aria-label="Upload photos from computer"
        data-testid="add-image-upload-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void upload(files, "photo").then((uploaded) =>
            uploaded.forEach((asset) => {
              addAsset(asset);
              insertPhoto(asset);
            }),
          );
        }}
      />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Add image">
                <ImageIcon />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Add image</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Add image frame</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => inputRef.current?.click()}>
            <Upload /> Upload from computer…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPickerOpen(true)}>
            <FolderOpen /> Choose from project photos…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={addEmptyFrame}>
            <SquareDashed /> Empty frame
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {items.length > 0 && (
        <div className="absolute top-11 left-2 z-20 w-64">
          <UploadQueue items={items} onDismiss={dismiss} />
        </div>
      )}
      <AssetPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="photo"
        title="Add image"
        description="Choose a project photo or upload new ones. The frame keeps the photo’s aspect ratio."
        assets={assets}
        target={target}
        onUploaded={(uploaded) => uploaded.forEach(addAsset)}
        onPick={(asset) => insertPhoto(asset)}
        pickLabel="Add to scene"
      />
    </>
  );
}

/** Add Logo: pick from this brand's Logo Library (other brands' logos never appear). */
function AddLogoButton() {
  const target = useEditorStore((s) => s.uploadTarget) as UploadTarget;
  const assets = useEditorStore((s) => s.assets);
  const addAsset = useEditorStore((s) => s.addAsset);
  const { insertLogo } = useInsertMedia();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ToolButton label="Add logo" onClick={() => setOpen(true)}>
        <Sparkles />
      </ToolButton>
      <AssetPickerDialog
        open={open}
        onOpenChange={setOpen}
        kind="logo"
        title="Add logo"
        description="Logos from this brand’s Brand Kit. Uploads here are added to the Brand Kit too."
        assets={assets}
        target={{ ...target, projectId: null }}
        onUploaded={(uploaded) => uploaded.forEach(addAsset)}
        onPick={(asset) => insertLogo(asset)}
        pickLabel="Add to scene"
      />
    </>
  );
}
