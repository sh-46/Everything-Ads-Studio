"use client";

import { Eye, PenTool } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "cn";
import { ScenePlayer } from "@/features/preview/scene-player";
import { useActiveScene, useEditorStore } from "../store/editor-store";

/** Live Remotion preview of the active scene, straight from the editor's current state. */
export function EditorPreview() {
  const scene = useActiveScene();
  const assets = useEditorStore(useShallow((s) => s.assets));
  const nonce = useEditorStore((s) => s.previewNonce);
  if (!scene) return null;
  return (
    <div className="h-full p-6" data-testid="editor-preview">
      <ScenePlayer document={scene.document} assets={assets} restartNonce={nonce} autoPlay />
    </div>
  );
}

export function CanvasModeToggle() {
  const mode = useEditorStore((s) => s.canvasMode);
  const setMode = useEditorStore((s) => s.setCanvasMode);
  const playPreview = useEditorStore((s) => s.playPreview);
  return (
    <div className="bg-muted flex items-center rounded-md p-0.5" role="radiogroup" aria-label="Canvas mode">
      {(
        [
          { value: "edit", label: "Edit", icon: PenTool },
          { value: "preview", label: "Preview motion", icon: Eye },
        ] as const
      ).map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => (value === "preview" ? playPreview() : setMode("edit"))}
          className={cn(
            "flex items-center gap-1.5 rounded px-2 py-1 text-xs",
            mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}
