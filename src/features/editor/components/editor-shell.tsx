"use client";

import { ArrowDownToLine, ArrowUpToLine, Copy, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { brandFontsFromAssets, type Asset } from "@/domain/asset";
import { useBrandFonts } from "@/features/fonts/use-brand-fonts";
import type { BrandKit } from "@/domain/brand-kit";
import type { Scene } from "@/domain/scene";
import { useAutosave } from "../hooks/use-autosave";
import { useKeyboardShortcuts } from "../hooks/use-keyboard-shortcuts";
import { useEditorStore, useSelectedLayer } from "../store/editor-store";
import { AssetLibrary } from "./asset-library";
import { AddLayerToolbar, ZoomControls } from "./canvas-toolbar";
import { CanvasModeToggle, EditorPreview } from "./editor-preview";
import { EditorTopBar } from "./editor-top-bar";
import { InspectorPanel } from "./inspector/inspector-panel";
import { LayerList } from "./layer-list";
import { SaveIssuesBanner } from "./save-issues-banner";
import { SceneList } from "./scene-list";

// Konva touches `window` at import time, so the canvas is client-only.
const CanvasStage = dynamic(() => import("./canvas-stage"), {
  ssr: false,
  loading: () => (
    <div className="text-muted-foreground flex h-full items-center justify-center text-xs">Loading canvas…</div>
  ),
});

export interface EditorShellProps {
  workspaceId: string;
  /** Scene to open first (from the Scenes Overview). */
  initialSceneId?: string;
  /** Local Demo Mode (decided on the server; never read from client env). */
  demoMode: boolean;
  projectId: string;
  projectName: string;
  brandId: string;
  brandName: string;
  kit: BrandKit;
  scenes: Scene[];
  assets: Asset[];
}

function SelectionActions() {
  const layer = useSelectedLayer();
  const duplicateLayer = useEditorStore((s) => s.duplicateLayer);
  const removeLayer = useEditorStore((s) => s.removeLayer);
  const reorderLayer = useEditorStore((s) => s.reorderLayer);
  if (!layer) return null;
  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Bring forward (⌘])"
        title="Bring forward (⌘])"
        onClick={() => reorderLayer(layer.id, "forward")}
      >
        <ArrowUpToLine />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Send backward (⌘[)"
        title="Send backward (⌘[)"
        onClick={() => reorderLayer(layer.id, "backward")}
      >
        <ArrowDownToLine />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Duplicate (⌘D)"
        title="Duplicate (⌘D)"
        onClick={() => duplicateLayer(layer.id)}
      >
        <Copy />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete (⌫)"
        title="Delete (⌫)"
        onClick={() => removeLayer(layer.id)}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

type LeftTab = "layers" | "assets";

export function EditorShell(props: EditorShellProps) {
  const initialized = useEditorStore((s) => s.projectId === props.projectId);
  const [tab, setTab] = useState<LeftTab>("layers");

  // Load server data into the store before first paint of the editor.
  useLayoutEffect(() => {
    useEditorStore.getState().init({
      projectId: props.projectId,
      brandId: props.brandId,
      kit: props.kit,
      assets: props.assets,
      scenes: props.scenes,
      uploadTarget: {
        workspaceId: props.workspaceId,
        brandId: props.brandId,
        projectId: props.projectId,
        demoMode: props.demoMode,
      },
    });
    if (props.initialSceneId) useEditorStore.getState().setActiveScene(props.initialSceneId);
    // Server props are only the initial state; later changes live in the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.projectId]);

  useAutosave();
  useKeyboardShortcuts();
  useEditorFonts();
  const canvasMode = useEditorStore((s) => s.canvasMode);
  const uploadTarget = useEditorStore((s) => s.uploadTarget);

  if (!initialized || !uploadTarget) return null;

  return (
    <div className="bg-background text-foreground flex h-dvh flex-col">
      <EditorTopBar
        brandId={props.brandId}
        brandName={props.brandName}
        projectId={props.projectId}
        projectName={props.projectName}
        demoMode={props.demoMode}
      />
      <SaveIssuesBanner />
      <div className="flex min-h-0 flex-1">
        <aside className="border-border flex w-64 shrink-0 flex-col border-r" aria-label="Scenes, layers and assets">
          <div className="border-border border-b">
            <h2 className="text-muted-foreground px-4 pt-3 text-[11px] font-medium tracking-wide uppercase">Scenes</h2>
            <div className="max-h-64 overflow-y-auto">
              <SceneList />
            </div>
          </div>
          <div role="tablist" aria-label="Panel" className="border-border flex gap-1 border-b px-2 pt-2">
            {(["layers", "assets"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "-mb-px border-b-2 px-2 pb-2 text-xs font-medium capitalize",
                  tab === t
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
            {tab === "layers" ? <LayerList /> : <AssetLibrary target={uploadTarget} demoMode={props.demoMode} />}
          </div>
        </aside>

        <main className="bg-muted/40 flex min-w-0 flex-1 flex-col">
          <div className="border-border bg-background relative flex h-10 shrink-0 items-center justify-between border-b px-2">
            <AddLayerToolbar />
            <SelectionActions />
          </div>
          <div className="min-h-0 flex-1">{canvasMode === "edit" ? <CanvasStage /> : <EditorPreview />}</div>
          <div className="border-border bg-background flex h-10 shrink-0 items-center justify-between border-t px-2">
            <CanvasModeToggle />
            {canvasMode === "edit" && <ZoomControls />}
          </div>
        </main>

        <InspectorPanel />
      </div>
    </div>
  );
}

/** Loads the brand's uploaded fonts (FontFace) and publishes their state to the store. */
function useEditorFonts() {
  const assets = useEditorStore((s) => s.assets);
  const setFontState = useEditorStore((s) => s.setFontState);
  const fonts = useMemo(() => brandFontsFromAssets(assets), [assets]);
  const { status, version } = useBrandFonts(fonts);
  useEffect(() => setFontState(status, version), [status, version, setFontState]);
}
