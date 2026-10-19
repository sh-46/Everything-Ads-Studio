"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/domain/asset";
import { msToFrames, PREVIEW_FPS } from "@/domain/motion-engine";
import type { SceneDocument } from "@/domain/scene";
import {
  SceneComposition,
  StackedComposition,
  stackedSize,
  type SceneCompositionProps,
  type StackedCompositionProps,
} from "./compositions";

type Source = { document: SceneDocument } | { documents: SceneDocument[] };

function formatTime(frame: number, fps: number): string {
  const seconds = frame / fps;
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

/** Largest size with the given aspect ratio that fits the element. */
function useFitSize(aspect: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const fitted = width / height > aspect ? { width: height * aspect, height } : { width, height: width / aspect };
      setSize({ width: Math.floor(fitted.width), height: Math.floor(fitted.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [aspect]);
  return { ref, size };
}

/**
 * Animated preview of the actual scene data (Remotion Player). Geometry stays in logical
 * scene pixels; the Player scales the whole composition to fit the available space.
 */
export function ScenePlayer({
  assets,
  autoPlay = false,
  loop = true,
  controls = true,
  restartNonce,
  playing,
  className,
  ...source
}: Source & {
  assets: Asset[];
  autoPlay?: boolean;
  loop?: boolean;
  controls?: boolean;
  /** Changing this restarts playback from frame 0. */
  restartNonce?: number;
  /** Controlled play state (e.g. play only the scene in view). */
  playing?: boolean;
  className?: string;
}) {
  const playerRef = useRef<PlayerRef>(null);
  const stacked = "documents" in source;
  const dims = stacked
    ? stackedSize(source.documents)
    : { width: source.document.width, height: source.document.height, durationMs: source.document.durationMs };
  const durationInFrames = msToFrames(dims.durationMs, PREVIEW_FPS);
  const { ref, size } = useFitSize(dims.width / dims.height);
  const [frame, setFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      setFrame(e.detail.frame);
      // Autoplay doesn't emit "play", so read the state from the player itself.
      setIsPlaying(player.isPlaying());
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("seeked", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onPause);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("seeked", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onPause);
    };
  }, [size.width]);

  useEffect(() => {
    if (restartNonce === undefined || !playerRef.current) return;
    playerRef.current.seekTo(0);
    playerRef.current.play();
  }, [restartNonce]);

  // Controlled playback (e.g. the scene scrolled into view). Initial play goes through
  // `autoPlay`; later changes restart or pause the already-mounted player.
  const mountedPlaying = useRef(playing);
  useEffect(() => {
    const player = playerRef.current;
    if (playing === undefined || !player || playing === mountedPlaying.current) return;
    mountedPlaying.current = playing;
    if (playing) {
      player.seekTo(0);
      player.play();
    } else {
      player.pause();
    }
  }, [playing, size.width]);

  // Keep the playhead inside the scene when its duration shrinks.
  const clampedFrame = Math.min(frame, durationInFrames - 1);

  const player =
    size.width > 0 ? (
      stacked ? (
        <Player
          ref={playerRef}
          component={StackedComposition as ComponentType<StackedCompositionProps>}
          inputProps={{ documents: source.documents, assets }}
          durationInFrames={durationInFrames}
          compositionWidth={dims.width}
          compositionHeight={dims.height}
          fps={PREVIEW_FPS}
          style={{ width: size.width, height: size.height }}
          autoPlay={autoPlay || playing === true}
          loop={loop}
          // No audio in these compositions. Muted players don't wait for an AudioContext
          // (which Chrome blocks until a click), so in-view autoplay works on page load.
          initiallyMuted
        />
      ) : (
        <Player
          ref={playerRef}
          component={SceneComposition as ComponentType<SceneCompositionProps>}
          inputProps={{ document: source.document, assets }}
          durationInFrames={durationInFrames}
          compositionWidth={dims.width}
          compositionHeight={dims.height}
          fps={PREVIEW_FPS}
          style={{ width: size.width, height: size.height }}
          autoPlay={autoPlay || playing === true}
          loop={loop}
          // No audio in these compositions. Muted players don't wait for an AudioContext
          // (which Chrome blocks until a click), so in-view autoplay works on page load.
          initiallyMuted
        />
      )
    ) : null;

  return (
    <div
      className={cn("flex h-full min-h-0 w-full flex-col", className)}
      data-testid="scene-player"
      data-frame={clampedFrame}
      data-playing={isPlaying}
    >
      <div ref={ref} className="flex min-h-0 flex-1 items-center justify-center">
        <div className="shadow-lg" style={{ width: size.width, height: size.height }}>
          {player}
        </div>
      </div>
      {controls && (
        <div className="flex shrink-0 items-center gap-2 pt-3" role="group" aria-label="Playback">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={isPlaying ? "Pause" : "Play"}
            onClick={() => playerRef.current?.toggle()}
          >
            {isPlaying ? <Pause /> : <Play />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Restart"
            onClick={() => {
              playerRef.current?.seekTo(0);
              playerRef.current?.play();
            }}
          >
            <RotateCcw />
          </Button>
          <input
            type="range"
            aria-label="Scrub"
            min={0}
            max={durationInFrames - 1}
            step={1}
            value={clampedFrame}
            onChange={(e) => {
              const next = Number(e.target.value);
              playerRef.current?.pause();
              playerRef.current?.seekTo(next);
              setFrame(next);
            }}
            className="accent-foreground h-1 min-w-0 flex-1 cursor-pointer"
          />
          <span className="text-muted-foreground w-24 text-right text-xs tabular-nums" data-testid="player-time">
            {formatTime(clampedFrame, PREVIEW_FPS)} / {formatTime(durationInFrames, PREVIEW_FPS)}
          </span>
        </div>
      )}
    </div>
  );
}
