"use client";

import { Eye, EyeOff, Image as ImageIcon, Lock, Shapes, Sparkles, Square, Type } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import type { LayerType } from "@/domain/scene";
import { useActiveScene, useEditorStore } from "../store/editor-store";

const TYPE_ICONS: Record<LayerType, React.ElementType> = {
  text: Type,
  image: ImageIcon,
  gradient: Square,
  shape: Shapes,
  logo: Sparkles,
};

/** Shows the top-most layer first, like design tools; the stored array is bottom-first. */
export function LayerList() {
  const scene = useActiveScene();
  const selectedLayerId = useEditorStore((s) => s.selectedLayerId);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const moveLayer = useEditorStore((s) => s.moveLayer);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  if (!scene) return null;
  const layers = scene.document.layers;
  const displayed = [...layers].reverse();

  if (layers.length === 0) {
    return <p className="text-muted-foreground p-3 text-xs">No layers yet. Add one from the toolbar.</p>;
  }

  return (
    <ul aria-label="Layers" className="space-y-px p-2" onDragLeave={() => setDropIndex(null)}>
      {displayed.map((layer, displayIndex) => {
        const Icon = TYPE_ICONS[layer.type];
        const selected = layer.id === selectedLayerId;
        const storedIndex = layers.length - 1 - displayIndex;
        return (
          <li
            key={layer.id}
            draggable
            onDragStart={(e) => {
              setDragId(layer.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setDropIndex(storedIndex);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) moveLayer(dragId, storedIndex);
              setDragId(null);
              setDropIndex(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setDropIndex(null);
            }}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-1 text-xs",
              selected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              dropIndex === storedIndex && dragId !== layer.id && "ring-primary/50 ring-1",
              !layer.visible && "text-muted-foreground",
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left"
              onClick={() => selectLayer(layer.id)}
              aria-pressed={selected}
            >
              <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{layer.name}</span>
            </button>
            {layer.locked && <Lock className="text-muted-foreground size-3 shrink-0" aria-label="Locked" />}
            <button
              type="button"
              className={cn(
                "text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5",
                layer.visible && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
              )}
              aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
              onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
            >
              {layer.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
