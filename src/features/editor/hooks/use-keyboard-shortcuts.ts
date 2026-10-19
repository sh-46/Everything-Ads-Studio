"use client";

import { useEffect } from "react";
import { stepZoom } from "../components/canvas-toolbar";
import { useEditorStore } from "../store/editor-store";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.getAttribute("role") === "combobox"
  );
}

/**
 * ⌘Z / ⇧⌘Z undo/redo · ⌘D duplicate · Delete remove · arrows nudge (⇧ = 10px)
 * ⌘] / ⌘[ forward/backward (⇧ = front/back) · Esc deselect · ⌘0 fit · ⌘+ / ⌘− zoom
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const store = useEditorStore.getState();
      const key = e.key.toLowerCase();

      // Undo/redo work everywhere except inside text fields (native undo there).
      if (mod && key === "z" && !isTyping(e.target)) {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && key === "y" && !isTyping(e.target)) {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && (key === "=" || key === "+")) {
        e.preventDefault();
        store.setZoom(stepZoom(typeof store.zoom === "number" ? store.zoom : 0.33, 1));
        return;
      }
      if (mod && key === "-") {
        e.preventDefault();
        store.setZoom(stepZoom(typeof store.zoom === "number" ? store.zoom : 0.33, -1));
        return;
      }
      if (mod && key === "0") {
        e.preventDefault();
        store.setZoom("fit");
        return;
      }
      if (isTyping(e.target)) return;

      const layerId = store.selectedLayerId;
      if (e.key === "Escape" && store.focusEditLayerId) {
        // Esc finishes focus-point editing first, keeping the layer selected.
        store.setFocusEdit(null);
        return;
      }
      if (e.key === "Escape") {
        // Escape closing a menu, dialog or dropdown shouldn't also deselect the layer.
        const overlayOpen = document.querySelector("[role=menu], [role=dialog], [role=listbox]");
        if (!e.defaultPrevented && !overlayOpen) store.selectLayer(null);
        return;
      }
      if (!layerId) return;
      const layer = store.scenes[store.activeSceneId]?.document.layers.find((l) => l.id === layerId);
      if (!layer) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        store.removeLayer(layerId);
      } else if (mod && key === "d") {
        e.preventDefault();
        store.duplicateLayer(layerId);
      } else if (mod && e.key === "]") {
        e.preventDefault();
        store.reorderLayer(layerId, e.shiftKey ? "front" : "forward");
      } else if (mod && e.key === "[") {
        e.preventDefault();
        store.reorderLayer(layerId, e.shiftKey ? "back" : "backward");
      } else if (e.key.startsWith("Arrow") && !layer.locked) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        store.updateLayer(layerId, { x: layer.x + dx, y: layer.y + dy }, `nudge:${layerId}`);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
