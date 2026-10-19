import { Composition, type CalculateMetadataFunction } from "remotion";
import { msToFrames } from "@/domain/motion-engine";
import { RenderScene, type RenderSceneProps } from "./render-scene";

const calculateMetadata: CalculateMetadataFunction<RenderSceneProps> = ({ props }) => ({
  width: props.document.width,
  height: props.document.height,
  fps: props.fps,
  // Exactly the scene's configured duration.
  durationInFrames: msToFrames(props.document.durationMs, props.fps),
});

/** Compositions available to the server-side renderer (one per scene, sized from data). */
export function RemotionRoot() {
  return (
    <Composition
      id="Scene"
      component={RenderScene}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={180}
      calculateMetadata={calculateMetadata}
      defaultProps={
        {
          document: {
            schemaVersion: 1,
            width: 1080,
            height: 1920,
            background: "#000000",
            durationMs: 6000,
            layers: [],
          },
          assets: [],
          fonts: [],
          staticLayout: false,
          fps: 30,
        } satisfies RenderSceneProps
      }
    />
  );
}
