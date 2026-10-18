"use client";

import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { saveScene } from "../actions";
import { isSceneDirty, useEditorStore } from "../store/editor-store";

const DEBOUNCE_MS = 800;
const RETRY_MS = 5000;

export type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict";

/** Saves every dirty scene once. Returns true if any save failed (caller retries). */
async function flushDirtyScenes(): Promise<boolean> {
  const failed = new Set<string>();
  // Re-read state each pass: edits made while a save is in flight get picked up.
  for (;;) {
    const state = useEditorStore.getState();
    const next = state.sceneOrder
      .map((id) => state.scenes[id])
      .find((s) => s && isSceneDirty(s) && !state.saveIssues[s.id]?.conflict && !failed.has(s.id));
    if (!next) break;

    const snapshotVersion = next.editVersion;
    state.markSaving(next.id, true);
    let result: Awaited<ReturnType<typeof saveScene>>;
    try {
      result = await saveScene({
        sceneId: next.id,
        expectedRevision: next.revision,
        name: next.name,
        document: next.document,
      });
    } catch (error) {
      result = { status: "error", error: error instanceof Error ? error.message : "Network error" };
    }

    const store = useEditorStore.getState();
    store.markSaving(next.id, false);
    if (result.status === "saved") {
      store.markSaved(next.id, snapshotVersion, result.revision, result.updatedAt);
    } else if (result.status === "conflict") {
      store.markSaveIssue(next.id, { conflict: result.current });
    } else {
      store.markSaveIssue(next.id, { error: result.error });
      failed.add(next.id);
    }
  }
  return failed.size > 0;
}

/**
 * Debounced autosave. Failed saves keep the scene dirty and retry; a conflict pauses
 * that scene until the user picks a version. Leaving the page with pending changes warns.
 */
export function useAutosave() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);
  const rerun = useRef(false);

  useEffect(() => {
    const schedule = (delay: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, delay);
    };

    const run = async () => {
      if (running.current) {
        rerun.current = true;
        return;
      }
      running.current = true;
      const hadError = await flushDirtyScenes();
      running.current = false;
      if (hadError) schedule(RETRY_MS);
      else if (rerun.current) schedule(0);
      rerun.current = false;
    };

    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (state.scenes !== prev.scenes) schedule(DEBOUNCE_MS);
    });

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const state = useEditorStore.getState();
      if (Object.values(state.scenes).some(isSceneDirty) || state.savingSceneIds.length > 0) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
      // Leaving the editor via in-app navigation: save what's pending right away.
      // The store outlives this component, so the flush can finish in the background.
      if (Object.values(useEditorStore.getState().scenes).some(isSceneDirty)) void flushDirtyScenes();
    };
  }, []);
}

export function useSaveStatus(): { status: SaveStatus; message: string | null } {
  return useEditorStore(
    useShallow((state) => {
      const issues = Object.values(state.saveIssues);
      if (issues.some((i) => i.conflict)) {
        return { status: "conflict" as const, message: "A scene was changed on another device." };
      }
      const error = issues.find((i) => i.error);
      if (error) return { status: "error" as const, message: error.error ?? "Save failed" };
      if (state.savingSceneIds.length > 0) return { status: "saving" as const, message: null };
      if (Object.values(state.scenes).some(isSceneDirty)) return { status: "unsaved" as const, message: null };
      return { status: "saved" as const, message: null };
    }),
  );
}
