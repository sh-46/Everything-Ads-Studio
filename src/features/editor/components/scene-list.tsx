"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { useShallow } from "zustand/react/shallow";
import { duplicateScene } from "../actions";
import { isSceneDirty, useEditorStore } from "../store/editor-store";

export function SceneList() {
  const scenes = useEditorStore(useShallow((s) => s.sceneOrder.map((id) => s.scenes[id])));
  const activeSceneId = useEditorStore((s) => s.activeSceneId);
  const setActiveScene = useEditorStore((s) => s.setActiveScene);
  const issues = useEditorStore((s) => s.saveIssues);
  const insertScene = useEditorStore((s) => s.insertScene);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Copies the scene as currently edited: layers, asset references and motion.
  const duplicate = async (sceneId: string) => {
    const scene = useEditorStore.getState().scenes[sceneId];
    if (!scene) return;
    setDuplicating(sceneId);
    setError(null);
    const result = await duplicateScene({
      sourceSceneId: sceneId,
      name: `${scene.name} copy`.slice(0, 120),
      document: scene.document,
    });
    setDuplicating(null);
    if (result.ok) insertScene(result.scene, sceneId);
    else setError(result.error);
  };

  return (
    <nav aria-label="Scenes" className="space-y-0.5 p-2">
      {scenes.map((scene) => {
        const active = scene.id === activeSceneId;
        const issue = issues[scene.id];
        return (
          <div key={scene.id} className="group relative">
            <button
              type="button"
              onClick={() => setActiveScene(scene.id)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              <span aria-hidden className="flex size-7 shrink-0 items-center justify-center">
                <span
                  className="border-border bg-muted rounded-[2px] border"
                  style={thumbSize(scene.document.width, scene.document.height)}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{scene.name}</span>
                <span className="text-muted-foreground block text-[10px] tabular-nums">
                  {scene.document.width}×{scene.document.height}
                </span>
              </span>
              {issue?.conflict || issue?.error ? (
                <span className="bg-destructive size-1.5 rounded-full" title="Not saved" />
              ) : isSceneDirty(scene) ? (
                <span className="size-1.5 rounded-full bg-amber-500" title="Unsaved changes" />
              ) : null}
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-5 -translate-y-1/2 rounded p-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-50"
              aria-label={`Duplicate ${scene.name}`}
              title="Duplicate scene"
              disabled={duplicating !== null}
              onClick={() => void duplicate(scene.id)}
            >
              <Copy className="size-3.5" />
            </button>
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-destructive px-2 text-[11px]">
          {error}
        </p>
      )}
    </nav>
  );
}

/** Aspect-correct thumbnail that fits a 24px box. */
function thumbSize(width: number, height: number) {
  const max = 24;
  return width >= height
    ? { width: max, height: Math.max(4, Math.round((max * height) / width)) }
    : { width: Math.max(4, Math.round((max * width) / height)), height: max };
}
