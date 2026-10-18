"use client";

import type Konva from "konva";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Group, Layer as KonvaLayer, Rect, Stage, Transformer } from "react-konva";
import { fitScale } from "@/domain/geometry";
import type { Layer } from "@/domain/scene";
import { useActiveScene, useEditorStore } from "../store/editor-store";
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

  const doc = scene?.document;
  const selected = doc?.layers.find((l) => l.id === selectedLayerId);
  const canTransform = Boolean(selected && selected.visible && !selected.locked);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = canTransform && selectedLayerId ? nodeRefs.current.get(selectedLayerId) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [canTransform, selectedLayerId, doc]);

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
    <div ref={viewportRef} className="h-full w-full overflow-auto" data-testid="editor-canvas">
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
                    draggable={!layer.locked}
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
            </Group>
            <Transformer
              ref={transformerRef}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={4}
              keepRatio={false}
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
