import { useEffect, useState } from "react";
import { AbsoluteFill, cancelRender, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import type { Asset, BrandFont } from "@/domain/asset";
import { frameToMs } from "@/domain/motion-engine";
import type { SceneDocument } from "@/domain/scene";
import { RenderModeContext, SceneLayers } from "@/features/preview/scene-layers";

export interface RenderSceneProps extends Record<string, unknown> {
  document: SceneDocument;
  assets: Asset[];
  /** Brand fonts with absolute URLs; loaded before any frame is captured. */
  fonts: BrandFont[];
  /** Render the static, fully-entered layout (used for the CTA PNG). */
  staticLayout: boolean;
  fps: number;
}

/** Loads brand fonts with FontFace and holds rendering until they're ready. */
function useRenderFonts(fonts: BrandFont[]) {
  const [handle] = useState(() => (fonts.length > 0 ? delayRender("Loading brand fonts") : null));
  useEffect(() => {
    if (handle === null) return;
    let cancelled = false;
    Promise.all(
      fonts.map(async (font) => {
        const face = new FontFace(font.family, `url("${font.url}")`, {
          weight: String(font.weight),
          style: font.style,
        });
        document.fonts.add(await face.load());
      }),
    )
      .then(() => !cancelled && continueRender(handle))
      .catch((error: unknown) => {
        // Fail loudly: a render with a fallback font wouldn't match the design.
        cancelRender(
          new Error(`Could not load a brand font: ${error instanceof Error ? error.message : String(error)}`),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [fonts, handle]);
}

/**
 * Export composition. It renders the very same `SceneLayers` the in-app preview uses,
 * so animation, framing, focus points and typography come from one implementation.
 */
export function RenderScene({ document: doc, assets, fonts, staticLayout }: RenderSceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  useRenderFonts(fonts);
  return (
    <RenderModeContext.Provider value="render">
      <AbsoluteFill style={{ background: doc.background }}>
        <SceneLayers document={doc} assets={assets} timeMs={staticLayout ? null : frameToMs(frame, fps)} />
      </AbsoluteFill>
    </RenderModeContext.Provider>
  );
}
