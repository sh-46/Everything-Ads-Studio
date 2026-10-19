"use client";

import type Konva from "konva";
import { useRef, useState } from "react";
import { Circle, Group, Line, Rect, Text } from "react-konva";
import type { Point, Size } from "@/domain/geometry";
import { focusFromFramePoint, focusInFrame, zoomedFraming } from "@/domain/motion-engine";
import type { ImageLayer } from "@/domain/scene";

/**
 * Editing overlay for an image's motion focus point (only drawn while editing — never in
 * the preview or exports). Click anywhere on the photo to place the point or drag the
 * crosshair. The frame underneath can't be moved while this is shown.
 */
export function FocusOverlay({
  layer,
  media,
  scale,
  onCommit,
}: {
  layer: ImageLayer;
  media: Size | null;
  /** Stage scale, so handles keep a constant on-screen size. */
  scale: number;
  onCommit: (focus: Point) => void;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const [dragging, setDragging] = useState<Point | null>(null);
  const stored = focusInFrame(layer, media);
  const isDefault = !layer.motionFocus;
  const center = { x: layer.width / 2, y: layer.height / 2 };
  const point = dragging ?? stored ?? center;
  const u = 1 / scale;

  // Framing guide uses the point being dragged, so it updates live.
  const preview: ImageLayer = dragging ? { ...layer, motionFocus: focusFromFramePoint(layer, media, dragging) } : layer;
  const framing = zoomedFraming(preview, media);

  const toImage = (p: Point) => focusFromFramePoint(layer, media, p);
  /** Clamp a frame point onto the visible photo area. */
  const snap = (p: Point): Point => {
    const f = toImage({ x: Math.min(layer.width, Math.max(0, p.x)), y: Math.min(layer.height, Math.max(0, p.y)) });
    const back = focusInFrame({ ...layer, motionFocus: f }, media)!;
    return { x: Math.min(layer.width, Math.max(0, back.x)), y: Math.min(layer.height, Math.max(0, back.y)) };
  };

  const placeAtPointer = () => {
    const pos = groupRef.current?.getRelativePointerPosition();
    if (pos) onCommit(toImage(snap(pos)));
  };

  return (
    <Group ref={groupRef} x={layer.x} y={layer.y} rotation={layer.rotation} name="focus-overlay">
      {/* Captures clicks so the frame below isn't selected or dragged. */}
      <Rect
        width={layer.width}
        height={layer.height}
        fill="rgba(15, 23, 42, 0.28)"
        stroke="#3B82F6"
        strokeWidth={1.5 * u}
        onMouseDown={(e) => {
          e.cancelBubble = true;
          placeAtPointer();
        }}
        onTap={placeAtPointer}
      />
      {framing && (
        <Rect
          x={framing.x}
          y={framing.y}
          width={framing.width}
          height={framing.height}
          stroke="#FFFFFF"
          strokeWidth={1.5 * u}
          dash={[8 * u, 6 * u]}
          listening={false}
        />
      )}
      {framing && (
        <Text
          x={framing.x + 6 * u}
          y={framing.y + 6 * u}
          text="Framing at full zoom"
          fontSize={11 * u}
          fill="#FFFFFF"
          listening={false}
        />
      )}
      <Group
        x={point.x}
        y={point.y}
        draggable
        name="focus-handle"
        onMouseDown={(e) => {
          e.cancelBubble = true;
        }}
        onDragStart={(e) => {
          e.cancelBubble = true;
          setDragging({ x: e.target.x(), y: e.target.y() });
        }}
        onDragMove={(e) => {
          e.cancelBubble = true;
          const p = snap({ x: e.target.x(), y: e.target.y() });
          e.target.position(p);
          setDragging(p);
        }}
        onDragEnd={(e) => {
          e.cancelBubble = true;
          const p = snap({ x: e.target.x(), y: e.target.y() });
          setDragging(null);
          onCommit(toImage(p));
        }}
      >
        <Circle radius={22 * u} fill="rgba(59, 130, 246, 0.25)" stroke="#FFFFFF" strokeWidth={2 * u} />
        <Line points={[-34 * u, 0, -8 * u, 0]} stroke="#FFFFFF" strokeWidth={2 * u} listening={false} />
        <Line points={[8 * u, 0, 34 * u, 0]} stroke="#FFFFFF" strokeWidth={2 * u} listening={false} />
        <Line points={[0, -34 * u, 0, -8 * u]} stroke="#FFFFFF" strokeWidth={2 * u} listening={false} />
        <Line points={[0, 8 * u, 0, 34 * u]} stroke="#FFFFFF" strokeWidth={2 * u} listening={false} />
        <Circle radius={3 * u} fill="#3B82F6" listening={false} />
        <Text
          x={26 * u}
          y={-30 * u}
          text={isDefault && !dragging ? "Focus (frame center)" : "Focus"}
          fontSize={12 * u}
          fontStyle="600"
          fill="#FFFFFF"
          shadowColor="black"
          shadowBlur={4 * u}
          listening={false}
        />
      </Group>
    </Group>
  );
}
