"use client";

import { cn } from "cn";
import { useShallow } from "zustand/react/shallow";
import { isSceneDirty, useEditorStore } from "../store/editor-store";

export function SceneList() {
  const scenes = useEditorStore(useShallow((s) => s.sceneOrder.map((id) => s.scenes[id])));
  const activeSceneId = useEditorStore((s) => s.activeSceneId);
  const setActiveScene = useEditorStore((s) => s.setActiveScene);
  const issues = useEditorStore((s) => s.saveIssues);

  return (
    <nav aria-label="Scenes" className="space-y-0.5 p-2">
      {scenes.map((scene) => {
        const active = scene.id === activeSceneId;
        const issue = issues[scene.id];
        return (
          <button
            key={scene.id}
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
        );
      })}
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
