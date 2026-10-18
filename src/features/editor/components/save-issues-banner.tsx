"use client";

import { AlertTriangle, CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "../store/editor-store";

/** Surfaces failed saves and revision conflicts; nothing is discarded without a choice. */
export function SaveIssuesBanner() {
  const issues = useEditorStore((s) => s.saveIssues);
  const scenes = useEditorStore((s) => s.scenes);
  const acceptServerScene = useEditorStore((s) => s.acceptServerScene);
  const overrideServerScene = useEditorStore((s) => s.overrideServerScene);

  const entries = Object.entries(issues);
  if (entries.length === 0) return null;

  return (
    <div className="border-border space-y-px border-b">
      {entries.map(([sceneId, issue]) => {
        const name = scenes[sceneId]?.name ?? "Scene";
        if (issue.conflict) {
          const conflict = issue.conflict;
          return (
            <div
              key={sceneId}
              role="alert"
              className="flex items-center gap-3 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span className="flex-1">
                <strong>{name}</strong> was saved from another window or device. Your latest changes to it are not saved
                yet.
              </span>
              <Button size="xs" variant="outline" onClick={() => acceptServerScene(conflict)}>
                Load their version
              </Button>
              <Button size="xs" onClick={() => overrideServerScene(sceneId, conflict.revision)}>
                Keep mine
              </Button>
            </div>
          );
        }
        return (
          <div
            key={sceneId}
            role="alert"
            className="bg-destructive/10 text-destructive flex items-center gap-3 px-4 py-2 text-xs"
          >
            <CloudOff className="size-4 shrink-0" />
            <span className="flex-1">
              Couldn&apos;t save <strong>{name}</strong>: {issue.error}. Your changes are kept in this tab and saving
              retries automatically.
            </span>
          </div>
        );
      })}
    </div>
  );
}
