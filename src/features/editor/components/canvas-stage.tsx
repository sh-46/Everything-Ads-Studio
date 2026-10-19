"use client";

import type Konva from "konva";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Group, Layer as KonvaLayer, Rect, Stage, Transformer } from "react-konva";
import { fitScale } from "@/domain/geometry";
import type { ImageLayer, Layer } from "@/domain/scene";
import { UploadQueue } from "@/features/assets/components/upload-widgets";
import { useUploader } from "@/features/assets/components/use-uploader";
import type { UploadTarget } from "@/features/assets/upload";
import { useInsertMedia } from "../hooks/use-insert-media";
import { useActiveScene, useEditorStore } from "../store/editor-store";
import { FocusOverlay } from "./layers/focus-overlay";
import { GradientNode, ImageNode, LogoNode, ShapeNode, TextNode } from "./layers/layer-nodes";

const PADDING = 48;
const MIN_SIZE = 4;

function LayerContent({ layer }: { layer: Layer }) {
  switch (layer.type) {
    case "text":
      return <TextNode layer={layer} />;
    case "image":
      return <ImageNode layer={layer} />;
    case "gradient":
      return <GradientNode layer={layer} />;
    case "shape":
      return <ShapeNode layer={layer} />;
    case "logo":
      return <LogoNode layer={layer} />;
  }
}

function useElementSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * The editable canvas. The Stage is scaled from logical scene pixels to screen pixels;
 * layer values in the store are always logical, so viewport zoom never affects export.
 */
export default function CanvasStage() {
  const scene = useActiveScene();
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const zoom = useEditorStore((s) => s.zoom);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const updateLayer = useEditorStore((s) => s.updateLayer);

  const viewportRef = useRef<HTMLDivElement>(null);
  const viewport = useElementSize(viewportRef);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Group>());

  const uploadTarget = useEditorStore((s) => s.uploadTarget) as UploadTarget;
  const addAsset = useEditorStore((s) => s.addAsset);
  const { insertPhoto } = useInsertMedia();
  const uploader = useUploader(uploadTarget);
  const [dropActive, setDropActive] = useState(false);
  const doc = scene?.document;
  const selected = doc?.layers.find((l) => l.id === selectedLayerId);
  const focusEditLayerId = useEditorStore((s) => s.focusEditLayerId);
  const setFocusEdit = useEditorStore((s) => s.setFocusEdit);
  const assets = useEditorStore((s) => s.assets);
  const focusLayer = doc?.layers.find((l) => l.id === focusEditLayerId && l.type === "image") as ImageLayer | undefined;
  const focusAsset = focusLayer?.assetId ? assets.find((a) => a.id === focusLayer.assetId) : undefined;
  const focusMedia =
    focusAsset?.width && focusAsset.height ? { width: focusAsset.width, height: focusAsset.height } : null;
  // No resize handles while placing a focus point.
  const canTransform = Boolean(selected && selected.visible && !selected.locked && !focusLayer);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = canTransform && selectedLayerId ? nodeRefs.current.get(selectedLayerId) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [canTransform, selectedLayerId, doc, focusLayer]);

  if (!scene || !doc) return <div ref={viewportRef} className="h-full w-full" />;

  const scale = zoom === "fit" ? fitScale(doc, viewport, PADDING) : Math.max(0.05, Math.min(4, zoom));
  const contentWidth = doc.width * scale;
  const contentHeight = doc.height * scale;
  const stageWidth = Math.max(viewport.width, contentWidth + PADDING * 2);
  const stageHeight = Math.max(viewport.height, contentHeight + PADDING * 2);
  const offsetX = (stageWidth - contentWidth) / 2;
  const offsetY = (stageHeight - contentHeight) / 2;

  // Konva scales the group while dragging handles; on release, bake scale into size.
  const commitTransform = (layer: Layer, node: Konva.Group) => {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scale({ x: 1, y: 1 });
    updateLayer(layer.id, {
      x: Math.round(node.x()),
      y: Math.round(node.y()),
      width: Math.max(MIN_SIZE, Math.round(layer.width * scaleX)),
      height: Math.max(MIN_SIZE, Math.round(layer.height * scaleY)),
      rotation: Math.round(node.rotation() * 100) / 100,
    });
  };

  return (
    <div
      ref={viewportRef}
      className={`relative h-full w-full overflow-auto ${dropActive ? "ring-primary ring-2 ring-inset" : ""}`}
      data-testid="editor-canvas"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropActive(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length === 0) return;
        // Drop point in scene coordinates, so photos land where they were dropped.
        const box = e.currentTarget.getBoundingClientRect();
        const at = {
          x: (e.clientX - box.left + e.currentTarget.scrollLeft - offsetX) / scale,
          y: (e.clientY - box.top + e.currentTarget.scrollTop - offsetY) / scale,
        };
        void uploader.upload(files, "photo").then((uploaded) =>
          uploaded.forEach((asset, i) => {
            addAsset(asset);
            insertPhoto(asset, { x: at.x + i * 40, y: at.y + i * 40 });
          }),
        );
      }}
    >
      {focusLayer && (
        <div
          className="bg-background/95 absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border px-4 py-1.5 text-xs shadow-md"
          role="status"
          data-testid="focus-edit-banner"
        >
          <span>Click or drag on the photo to place the motion focus point.</span>
          <button
            type="button"
            className="bg-primary text-primary-foreground rounded-full px-3 py-0.5 font-medium"
            onClick={() => setFocusEdit(null)}
          >
            Done (Esc)
          </button>
        </div>
      )}
      {uploader.items.length > 0 && (
        <div className="absolute top-2 left-2 z-10 w-64">
          <UploadQueue items={uploader.items} onDismiss={uploader.dismiss} />
        </div>
      )}
      {viewport.width > 0 && (
        <Stage
          width={stageWidth}
          height={stageHeight}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) selectLayer(null);
          }}
        >
          <KonvaLayer>
            <Group x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
              <Rect
                width={doc.width}
                height={doc.height}
                fill={doc.background}
                shadowColor="black"
                shadowOpacity={0.35}
                shadowBlur={24 / scale}
                onMouseDown={() => selectLayer(null)}
              />
              <Group clipX={0} clipY={0} clipWidth={doc.width} clipHeight={doc.height}>
                {doc.layers.map((layer) => (
                  <Group
                    key={layer.id}
                    ref={(node) => {
                      if (node) nodeRefs.current.set(layer.id, node);
                      else nodeRefs.current.delete(layer.id);
                    }}
                    x={layer.x}
                    y={layer.y}
                    rotation={layer.rotation}
                    opacity={layer.opacity}
                    visible={layer.visible}
                    listening={!layer.locked}
                    draggable={!layer.locked && layer.id !== focusEditLayerId}
                    onMouseDown={(e) => {
                      e.cancelBubble = true;
                      selectLayer(layer.id);
                    }}
                    onTap={() => selectLayer(layer.id)}
                    onDragStart={() => selectLayer(layer.id)}
                    onDragEnd={(e) => {
                      updateLayer(layer.id, { x: Math.round(e.target.x()), y: Math.round(e.target.y()) });
                    }}
                    onTransformEnd={(e) => commitTransform(layer, e.currentTarget as unknown as Konva.Group)}
                  >
                    <LayerContent layer={layer} />
                  </Group>
                ))}
              </Group>
              {focusLayer && (
                <FocusOverlay
                  layer={focusLayer}
                  media={focusMedia}
                  scale={scale}
                  onCommit={(motionFocus) =>
                    updateLayer(focusLayer.id, {
                      motionFocus: { x: Number(motionFocus.x.toFixed(4)), y: Number(motionFocus.y.toFixed(4)) },
                    })
                  }
                />
              )}
            </Group>
            <Transformer
              ref={transformerRef}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={4}
              // Logos keep their proportions; frames and text boxes resize freely.
              keepRatio={selected?.type === "logo"}
              ignoreStroke
              anchorSize={8}
              anchorCornerRadius={2}
              borderStroke="#3B82F6"
              anchorStroke="#3B82F6"
              boundBoxFunc={(oldBox, newBox) =>
                Math.abs(newBox.width) < MIN_SIZE * scale || Math.abs(newBox.height) < MIN_SIZE * scale
                  ? oldBox
                  : newBox
              }
            />
          </KonvaLayer>
        </Stage>
      )}
    </div>
  );
}
