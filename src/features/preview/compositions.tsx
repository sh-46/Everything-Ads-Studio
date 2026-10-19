import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { Asset } from "@/domain/asset";
import { frameToMs } from "@/domain/motion-engine";
import type { SceneDocument } from "@/domain/scene";
import { SceneLayers } from "./scene-layers";

/**
 * Remotion compositions. Inputs are the saved scene format itself — there is no separate
 * animation format. The Phase 4 render worker will register these same components.
 */

export interface SceneCompositionProps extends Record<string, unknown> {
  document: SceneDocument;
  assets: Asset[];
}

export function SceneComposition({ document, assets }: SceneCompositionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: document.background }}>
      <SceneLayers document={document} assets={assets} timeMs={frameToMs(frame, fps)} />
    </AbsoluteFill>
  );
}

export interface StackedCompositionProps extends Record<string, unknown> {
  /** Drawn top to bottom, e.g. the 1080×1620 Outro above the 1080×300 CTA. */
  documents: SceneDocument[];
  assets: Asset[];
}

/**
 * Several independently edited scenes shown as one canvas (Outro + CTA = 1080×1920).
 * Each part keeps its own timing; the stack is only a preview arrangement.
 */
export function StackedComposition({ documents, assets }: StackedCompositionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeMs = frameToMs(frame, fps);
  const tops = documents.map((_, i) => documents.slice(0, i).reduce((sum, d) => sum + d.height, 0));
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {documents.map((doc, i) => (
        <SceneLayers key={i} document={doc} assets={assets} timeMs={timeMs} offsetY={tops[i]} />
      ))}
    </AbsoluteFill>
  );
}

export function stackedSize(documents: SceneDocument[]): { width: number; height: number; durationMs: number } {
  return {
    width: Math.max(...documents.map((d) => d.width)),
    height: documents.reduce((sum, d) => sum + d.height, 0),
    durationMs: Math.max(...documents.map((d) => d.durationMs)),
  };
}
