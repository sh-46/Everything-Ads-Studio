import "server-only";

import { existsSync, promises as fs, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Asset, BrandFont } from "@/domain/asset";
import { h264Level, measuredBitrateKbps, MP4_SETTINGS } from "@/domain/export-settings";
import { msToFrames } from "@/domain/motion-engine";
import type { SceneDocument } from "@/domain/scene";

/**
 * Local Remotion rendering. Renders the same `SceneLayers` composition the in-app
 * preview uses (src/remotion), so exports match the preview. Runs in the Next server
 * process; the heavy work happens in a separate browser and ffmpeg process.
 */

export const EXPORT_FPS = MP4_SETTINGS.fps;

/** Inserts `-profile:v high -level:v N` right after the H.264 encoder argument. */
function withProfile(args: string[], width: number, height: number): string[] {
  const index = args.findIndex((a, i) => a === "libx264" && args[i - 1] === "-c:v");
  if (index === -1) return args;
  return [
    ...args.slice(0, index + 1),
    "-profile:v",
    MP4_SETTINGS.profile,
    "-level:v",
    h264Level(width, height),
    ...args.slice(index + 1),
  ];
}
const ROOT = process.cwd();
const ENTRY = path.join(ROOT, "src/remotion/index.ts");
/** Directories whose code is bundled for rendering; a change triggers a rebundle. */
// Runtime-only paths: excluded from build output tracing (the renderer reads source at run time).
const BUNDLED_SOURCES = ["src/remotion", "src/features/preview", "src/domain"].map((d) =>
  path.join(/*turbopackIgnore: true*/ ROOT, d),
);

export interface RenderInput {
  document: SceneDocument;
  assets: Asset[];
  fonts: BrandFont[];
}

/**
 * Browser for rendering. Remotion's downloaded headless shell didn't start rendering on
 * this macOS version, so an installed Google Chrome is preferred when present. Override
 * with REMOTION_BROWSER_EXECUTABLE (set to "headless-shell" to force Remotion's own).
 */
type BrowserOptions = {
  browserExecutable?: string;
  chromeMode?: "chrome-for-testing";
  /** Software GL: slower than GPU but stable for long, image-heavy renders. */
  chromiumOptions: { gl: "swangle" };
};

function browserOptions(): BrowserOptions {
  const configured = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (configured === "headless-shell") return { chromiumOptions: { gl: "swangle" } };
  const candidate = configured || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return existsSync(/*turbopackIgnore: true*/ candidate)
    ? { browserExecutable: candidate, chromeMode: "chrome-for-testing", chromiumOptions: { gl: "swangle" } }
    : { chromiumOptions: { gl: "swangle" } };
}

function concurrency(): number {
  // Leave headroom so the editor stays responsive while rendering.
  return Math.max(1, Math.min(3, Math.floor(os.cpus().length / 3)));
}

async function sourceSignature(): Promise<string> {
  let latest = 0;
  const walk = async (dir: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
        latest = Math.max(latest, statSync(full).mtimeMs);
      }
    }
  };
  for (const dir of BUNDLED_SOURCES) await walk(dir);
  return String(latest);
}

type BundleCache = { signature: string; serveUrl: Promise<string> };
const globalKey = "__everythingAdsRemotionBundle" as const;
type G = typeof globalThis & { [globalKey]?: BundleCache };

/** Bundles src/remotion once per code version (≈1–3 s) and reuses it. */
async function getServeUrl(): Promise<string> {
  const g = globalThis as G;
  const signature = await sourceSignature();
  if (g[globalKey]?.signature === signature) return g[globalKey]!.serveUrl;
  const { bundle } = await import("@remotion/bundler");
  const serveUrl = bundle({
    // Fast enough uncached, and avoids stale/corrupt webpack disk caches between runs.
    enableCaching: false,
    entryPoint: ENTRY,
    webpackOverride: (config) => ({
      ...config,
      resolve: {
        ...config.resolve,
        alias: { ...(config.resolve?.alias as Record<string, string>), "@": path.join(ROOT, "src") },
      },
    }),
  });
  g[globalKey] = { signature, serveUrl };
  serveUrl.catch(() => {
    if (g[globalKey]?.signature === signature) delete g[globalKey];
  });
  return serveUrl;
}

/** Ensure the bundle is ready (used for the "Preparing assets" stage). */
export async function prepareRenderer(): Promise<void> {
  await getServeUrl();
}

function inputProps(input: RenderInput, staticLayout: boolean) {
  return { document: input.document, assets: input.assets, fonts: input.fonts, staticLayout, fps: EXPORT_FPS };
}

async function select(input: RenderInput, staticLayout: boolean) {
  const { selectComposition } = await import("@remotion/renderer");
  const serveUrl = await getServeUrl();
  const props = inputProps(input, staticLayout);
  const composition = await selectComposition({
    serveUrl,
    id: "Scene",
    inputProps: props,
    timeoutInMilliseconds: 60_000,
    ...browserOptions(),
  });
  return { serveUrl, composition, props };
}

export interface VideoCheck {
  width: number;
  height: number;
  fps: number;
  durationInSeconds: number;
  codec: string | null;
  /** Measured average bitrate of the file (target is MP4_SETTINGS.targetBitrateKbps). */
  bitrateKbps: number;
}

/** H.264 MP4 at exactly the scene's size, 30 fps and configured duration. */
export async function renderVideo(
  input: RenderInput,
  outputLocation: string,
  onProgress: (progress: number) => void,
): Promise<VideoCheck> {
  const { renderMedia, getVideoMetadata, makeCancelSignal } = await import("@remotion/renderer");
  const { serveUrl, composition, props } = await select(input, false);
  const { cancelSignal, cancel } = makeCancelSignal();
  // Watchdog: a crashed browser must fail the job, never leave it hanging.
  const budgetMs = 120_000 + composition.durationInFrames * 1500;
  let lastProgressAt = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - lastProgressAt > 90_000) cancel();
  }, 5000);
  const hardLimit = setTimeout(cancel, budgetMs);
  const render = renderMedia({
    cancelSignal,
    serveUrl,
    composition,
    inputProps: props,
    codec: MP4_SETTINGS.codec,
    pixelFormat: MP4_SETTINGS.pixelFormat,
    colorSpace: "bt709",
    imageFormat: "jpeg",
    jpegQuality: 95,
    // Standardized: 5 Mbps target (ABR) with a VBV cap; constant 30 fps from the composition.
    videoBitrate: `${MP4_SETTINGS.targetBitrateKbps}k`,
    encodingMaxRate: `${MP4_SETTINGS.maxBitrateKbps}k`,
    encodingBufferSize: `${MP4_SETTINGS.bufferKbits}k`,
    // Explicit, broadly compatible profile/level chosen from the frame size.
    ffmpegOverride: ({ args }) => withProfile(args, input.document.width, input.document.height),
    outputLocation,
    overwrite: true,
    concurrency: concurrency(),
    timeoutInMilliseconds: 60_000,
    onProgress: ({ progress }) => {
      lastProgressAt = Date.now();
      onProgress(progress);
    },
    ...browserOptions(),
  });
  try {
    await render;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      /cancel/i.test(message)
        ? "Rendering stopped responding (the render browser may have crashed). Retry the export."
        : `Rendering failed: ${message}`,
    );
  } finally {
    clearInterval(watchdog);
    clearTimeout(hardLimit);
  }
  const meta = await getVideoMetadata(outputLocation);
  const check: VideoCheck = {
    width: meta.width,
    height: meta.height,
    fps: meta.fps,
    durationInSeconds: meta.durationInSeconds ?? 0,
    codec: meta.codec ?? null,
    bitrateKbps: measuredBitrateKbps((await fs.stat(outputLocation)).size, meta.durationInSeconds ?? 0),
  };
  const expectedFrames = msToFrames(input.document.durationMs, EXPORT_FPS);
  const problems: string[] = [];
  if (check.codec !== "h264") problems.push(`codec ${check.codec}`);
  if (check.width !== input.document.width || check.height !== input.document.height) {
    problems.push(`size ${check.width}×${check.height}`);
  }
  if (Math.abs(check.fps - EXPORT_FPS) > 0.01) problems.push(`${check.fps} fps`);
  if (Math.abs(check.durationInSeconds - expectedFrames / EXPORT_FPS) > 1.5 / EXPORT_FPS) {
    problems.push(`duration ${check.durationInSeconds.toFixed(3)} s`);
  }
  if (problems.length) throw new Error(`Rendered video failed validation: ${problems.join(", ")}.`);
  return check;
}

/**
 * CTA PNG. Still-frame policy: the static, fully-entered layout — the same arrangement
 * the Scene Editor shows — with entrance/exit animation ignored.
 */
export async function renderPng(input: RenderInput, output: string): Promise<{ width: number; height: number }> {
  const { renderStill } = await import("@remotion/renderer");
  const { serveUrl, composition, props } = await select(input, true);
  await renderStill({
    serveUrl,
    composition,
    inputProps: props,
    output,
    frame: 0,
    imageFormat: "png",
    overwrite: true,
    timeoutInMilliseconds: 60_000,
    ...browserOptions(),
  });
  const size = await pngSize(output);
  if (size.width !== input.document.width || size.height !== input.document.height) {
    throw new Error(
      `Rendered PNG is ${size.width}×${size.height}, expected ${input.document.width}×${input.document.height}.`,
    );
  }
  return size;
}

/** Reads width/height from the PNG IHDR chunk (also proves the file is a PNG). */
export async function pngSize(file: string): Promise<{ width: number; height: number }> {
  const handle = await fs.open(file, "r");
  try {
    const header = Buffer.alloc(24);
    await handle.read(header, 0, 24, 0);
    const signature = header.subarray(0, 8).toString("hex");
    if (signature !== "89504e470d0a1a0a" || header.subarray(12, 16).toString("ascii") !== "IHDR") {
      throw new Error("Rendered file is not a valid PNG.");
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } finally {
    await handle.close();
  }
}
