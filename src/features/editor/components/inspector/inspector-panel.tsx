"use client";

import { useActiveScene, useSelectedLayer } from "../../store/editor-store";
import { LayerInspector } from "./layer-inspector";
import { SceneInspector } from "./scene-inspector";

export function InspectorPanel() {
  const scene = useActiveScene();
  const layer = useSelectedLayer();
  if (!scene) return null;
  return (
    <aside
      className="border-border bg-background flex w-72 shrink-0 flex-col overflow-y-auto border-l"
      aria-label="Properties"
    >
      {/* Keyed so local field drafts reset when the selection changes. */}
      {layer ? <LayerInspector key={layer.id} layer={layer} /> : <SceneInspector key={scene.id} scene={scene} />}
    </aside>
  );
}
