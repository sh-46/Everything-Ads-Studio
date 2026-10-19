import "server-only";

import { randomUUID } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Asset } from "@/domain/asset";
import type { ExportItem } from "@/domain/export-plan";
import type { Scene } from "@/domain/scene";
import { measuredBitrateKbps } from "@/domain/export-settings";
import { msToFrames } from "@/domain/motion-engine";
import { prepareScene } from "./inputs";
import { uniqueNames, verifyZip, writeZip } from "./zip";
import {
  EXPORT_FPS,
  FALLBACK_GL,
  prepareRenderer,
  releaseBrowser,
  renderPng,
  renderTuning,
  renderVideo,
  type GlRenderer,
} from "./renderer";

/**
 * Local export job queue. One job renders at a time (each render already uses several
 * CPU cores), so the machine and the editor stay responsive. Jobs live in memory and
 * their files in the OS temp directory; a future cloud worker can replace this module
 * behind the same API routes.
 */

export type ItemStatus = "queued" | "rendering" | "done" | "failed";
export type JobStatus = "queued" | "preparing" | "rendering" | "packaging" | "ready" | "failed";

export interface JobItem extends ExportItem {
  status: ItemStatus;
  progress: number;
  error: string | null;
  warnings: string[];
  bytes: number | null;
  /** Measured average bitrate (MP4 only); the target is MP4_SETTINGS.targetBitrateKbps. */
  bitrateKbps: number | null;
  /** Reused an identical earlier render. */
  cached: boolean;
  /** Frames to render (MP4) — progress and ETA are weighted by this. */
  frames: number;
  /** Measured wall-clock time for this file (null when reused or not rendered yet). */
  renderMs: number | null;
  renderedFrames: number;
}

export interface ExportJob {
  id: string;
  ownerId: string;
  projectId: string;
  kind: "package" | "single";
  /** Dedupe key: same project + same request while a job is active → same job. */
  requestKey: string;
  zipName: string | null;
  status: JobStatus;
  stage: string;
  error: string | null;
  items: JobItem[];
  createdAt: number;
  /** When rendering (after preparation) began, and how long the whole job took. */
  startedAt: number | null;
  finishedAt: number | null;
  /** Render settings used, for benchmarking ("6 parallel frames · swangle"). */
  tuning: ReturnType<typeof renderTuning> | null;
}

/** A PNG still costs about as much as this many video frames (measured: ~1 s vs ~6 fps). */
const PNG_WEIGHT_FRAMES = 6;

function weight(item: Pick<JobItem, "format" | "frames">): number {
  return item.format === "png" ? PNG_WEIGHT_FRAMES : Math.max(1, item.frames);
}

/** Everything needed to (re)run a job without reloading the project. */
interface JobContext {
  scenes: Map<string, Scene>;
  assets: Asset[];
  origin: string;
}

const ROOT_DIR = path.join(os.tmpdir(), "everything-ads-exports");
const CACHE_DIR = path.join(ROOT_DIR, "cache");
const JOB_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface Registry {
  jobs: Map<string, ExportJob>;
  contexts: Map<string, JobContext>;
  queue: string[];
  running: boolean;
}
const globalKey = "__everythingAdsExportJobs" as const;
type G = typeof globalThis & { [globalKey]?: Registry };
function registry(): Registry {
  const g = globalThis as G;
  g[globalKey] ??= { jobs: new Map(), contexts: new Map(), queue: [], running: false };
  return g[globalKey];
}

export function jobDir(jobId: string): string {
  return path.join(ROOT_DIR, "jobs", jobId);
}

export function itemPath(job: ExportJob, item: JobItem): string {
  return path.join(jobDir(job.id), item.folder, item.filename);
}

export function zipPath(job: ExportJob): string | null {
  return job.zipName ? path.join(jobDir(job.id), job.zipName) : null;
}

/** Removes finished jobs and stale cached renders. Never touches running jobs. */
async function cleanup() {
  const reg = registry();
  const now = Date.now();
  for (const job of reg.jobs.values()) {
    if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) {
      reg.jobs.delete(job.id);
      reg.contexts.delete(job.id);
      await fs.rm(jobDir(job.id), { recursive: true, force: true });
    }
  }
  if (existsSync(CACHE_DIR)) {
    for (const name of await fs.readdir(CACHE_DIR)) {
      const file = path.join(CACHE_DIR, name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat && now - stat.mtimeMs > CACHE_TTL_MS) await fs.rm(file, { force: true });
    }
  }
}

export function getJob(jobId: string): ExportJob | null {
  return registry().jobs.get(jobId) ?? null;
}

export function createJob(input: {
  ownerId: string;
  projectId: string;
  kind: "package" | "single";
  requestKey: string;
  zipName: string | null;
  items: ExportItem[];
  scenes: Scene[];
  assets: Asset[];
  origin: string;
}): ExportJob {
  const reg = registry();
  // Prevent duplicates: the same export already queued or running is returned instead.
  for (const job of reg.jobs.values()) {
    if (
      job.ownerId === input.ownerId &&
      job.requestKey === input.requestKey &&
      !["ready", "failed"].includes(job.status)
    ) {
      return job;
    }
  }
  const job: ExportJob = {
    id: randomUUID(),
    ownerId: input.ownerId,
    projectId: input.projectId,
    kind: input.kind,
    requestKey: input.requestKey,
    zipName: input.zipName,
    status: "queued",
    stage: "Queued",
    error: null,
    items: input.items.map((item) => ({
      ...item,
      status: "queued",
      progress: 0,
      error: null,
      warnings: [],
      bytes: null,
      bitrateKbps: null,
      cached: false,
      frames: item.format === "png" ? 1 : msToFrames(item.durationMs, EXPORT_FPS),
      renderMs: null,
      renderedFrames: 0,
    })),
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    tuning: null,
  };
  reg.jobs.set(job.id, job);
  reg.contexts.set(job.id, {
    scenes: new Map(input.scenes.map((s) => [s.id, s])),
    assets: input.assets,
    origin: input.origin,
  });
  enqueue(job.id);
  return job;
}

/** Re-runs failed items of a finished job (successful items are reused). */
export function retryJob(jobId: string): ExportJob | null {
  const job = getJob(jobId);
  if (!job || job.status !== "failed") return job;
  for (const item of job.items) {
    if (item.status === "failed")
      Object.assign(item, { status: "queued", progress: 0, error: null, renderedFrames: 0 });
  }
  Object.assign(job, { status: "queued", stage: "Queued", error: null, finishedAt: null });
  enqueue(job.id);
  return job;
}

function enqueue(jobId: string) {
  const reg = registry();
  reg.queue.push(jobId);
  void drain();
}

async function drain() {
  const reg = registry();
  if (reg.running) return;
  reg.running = true;
  try {
    for (let next = reg.queue.shift(); next; next = reg.queue.shift()) {
      const job = reg.jobs.get(next);
      const context = reg.contexts.get(next);
      if (job && context) await runJob(job, context);
    }
  } finally {
    reg.running = false;
  }
}

async function runJob(job: ExportJob, context: JobContext) {
  try {
    await cleanup();
    job.status = "preparing";
    job.stage = "Preparing assets";
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(jobDir(job.id), { recursive: true });
    await prepareRenderer();

    job.status = "rendering";
    job.startedAt = Date.now();
    job.tuning = renderTuning();
    for (const item of job.items) {
      if (item.status === "done") continue;
      await renderItem(job, item, context);
    }
    await releaseBrowser();

    const failed = job.items.filter((i) => i.status === "failed");
    if (failed.length > 0) {
      throw new Error(
        `${failed.length} of ${job.items.length} ${job.items.length === 1 ? "asset" : "assets"} failed to render.`,
      );
    }

    if (job.kind === "package") {
      job.status = "packaging";
      job.stage = "Packaging ZIP";
      await packageZip(job);
    }
    job.status = "ready";
    job.stage = "Ready to download";
  } catch (error) {
    await releaseBrowser();
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.stage = "Export failed";
  } finally {
    job.finishedAt = Date.now();
    if (job.startedAt) {
      const rendered = job.items.filter((i) => i.renderMs !== null);
      console.info(
        `[export] ${job.kind} ${job.id.slice(0, 8)} ${job.status} in ${((job.finishedAt - job.createdAt) / 1000).toFixed(1)} s ` +
          `(${rendered.length} rendered, ${job.items.length - rendered.length} reused; ` +
          `concurrency ${job.tuning?.concurrency}, gl ${job.tuning?.gl}, reuse browser ${job.tuning?.reuseBrowser})`,
      );
    }
  }
}

async function renderItem(job: ExportJob, item: JobItem, context: JobContext) {
  item.status = "rendering";
  item.progress = 0;
  job.stage = item.format === "png" ? `Rendering ${item.label} PNG` : `Rendering ${item.label}`;
  const scene = context.scenes.get(item.sceneId);
  try {
    if (!scene) throw new Error("Scene not found.");
    const prepared = prepareScene(scene, context.assets, context.origin, item.format);
    item.warnings = prepared.warnings;
    if (prepared.errors.length > 0) throw new Error(prepared.errors.join(" "));

    const target = itemPath(job, item);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const cached = path.join(CACHE_DIR, `${prepared.cacheKey}.${item.format}`);
    if (existsSync(cached)) {
      item.cached = true;
    } else {
      const temp = path.join(jobDir(job.id), `.${item.key}.rendering.${item.format}`);
      const startedAt = performance.now();
      const render = (gl: GlRenderer) =>
        item.format === "png"
          ? renderPng(prepared.input, temp, gl)
          : renderVideo(
              prepared.input,
              temp,
              (p) => {
                item.progress = Math.min(0.99, p.progress);
                item.renderedFrames = p.renderedFrames;
                item.frames = p.totalFrames;
              },
              gl,
            );
      const gl = renderTuning().gl;
      try {
        await render(gl);
      } catch (error) {
        // GPU rendering is ~4× faster but a GPU/driver hiccup shouldn't fail the export:
        // retry this file once with software GL (same output, just slower).
        if (gl === FALLBACK_GL) throw error;
        console.warn(`[export] ${item.label}: ${gl} render failed, retrying with ${FALLBACK_GL}:`, error);
        item.progress = 0;
        item.renderedFrames = 0;
        item.warnings.push("Rendered with software graphics after a GPU rendering error (slower, same output).");
        await render(FALLBACK_GL);
      }
      item.renderMs = Math.round(performance.now() - startedAt);
      console.info(
        `[export] ${item.label} ${item.format.toUpperCase()} ${item.width}×${item.height}` +
          (item.format === "mp4"
            ? ` ${item.frames} frames in ${(item.renderMs / 1000).toFixed(1)} s (${((item.frames * 1000) / item.renderMs).toFixed(1)} fps)`
            : ` in ${(item.renderMs / 1000).toFixed(1)} s`),
      );
      await fs.rename(temp, cached);
    }
    await fs.copyFile(cached, target);
    await fs.utimes(cached, new Date(), new Date());
    const stat = await fs.stat(target);
    if (stat.size === 0) throw new Error("Rendered file is empty.");
    item.bytes = stat.size;
    item.bitrateKbps = item.format === "mp4" ? measuredBitrateKbps(stat.size, item.durationMs / 1000) : null;
    item.progress = 1;
    item.status = "done";
  } catch (error) {
    item.status = "failed";
    item.error = error instanceof Error ? error.message : String(error);
  }
}

/** Packages every rendered file (stored, not recompressed) and verifies the result. */
async function packageZip(job: ExportJob) {
  const out = zipPath(job)!;
  const names = uniqueNames(job.items.map((i) => (i.folder ? `${i.folder}/${i.filename}` : i.filename)));
  const entries = job.items.map((item, i) => ({ name: names[i], source: itemPath(job, item) }));
  await writeZip(out, entries);
  await verifyZip(out, entries);
}

/** Public, serializable view of a job (no file paths). */
/**
 * Progress weighted by frames (a 10 s scene counts for more than a 7 s one; a PNG is
 * small). The ETA uses this job's measured throughput, so it adapts to the machine.
 */
function progressOf(job: ExportJob): { progress: number; etaMs: number | null } {
  if (job.status === "ready") return { progress: 1, etaMs: 0 };
  const total = job.items.reduce((sum, i) => sum + weight(i), 0);
  if (!total) return { progress: 0, etaMs: null };
  const doneWeight = (i: JobItem) =>
    i.status === "done" ? weight(i) : i.status === "rendering" ? weight(i) * i.progress : 0;
  const done = job.items.reduce((sum, i) => sum + doneWeight(i), 0);
  // Leave a sliver for packaging so 100% means "downloadable".
  const progress = Math.min(0.99, done / total);
  if (job.status !== "rendering" || !job.startedAt) return { progress, etaMs: null };
  // Throughput from work actually rendered (reused files finish instantly and would skew it).
  const worked = job.items.filter((i) => !i.cached && (i.renderMs !== null || i.status === "rendering"));
  const workedWeight = worked.reduce((sum, i) => sum + doneWeight(i), 0);
  const elapsed = Date.now() - job.startedAt;
  if (workedWeight < total * 0.03 || elapsed < 3000) return { progress, etaMs: null };
  const remaining = total - done;
  return { progress, etaMs: Math.round((remaining / workedWeight) * elapsed) };
}

export function publicJob(job: ExportJob) {
  const { progress, etaMs } = progressOf(job);
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    error: job.error,
    zipName: job.zipName,
    progress,
    etaMs,
    elapsedMs: (job.finishedAt ?? Date.now()) - job.createdAt,
    tuning: job.tuning,
    zipBytes: null as number | null,
    items: job.items.map(
      ({
        key,
        label,
        sceneName,
        format,
        folder,
        filename,
        width,
        height,
        durationMs,
        status,
        progress,
        error,
        warnings,
        bytes,
        bitrateKbps,
        cached,
        frames,
        renderMs,
        renderedFrames,
      }) => ({
        key,
        label,
        sceneName,
        format,
        folder,
        filename,
        width,
        height,
        durationMs,
        status,
        progress,
        error,
        warnings,
        bytes,
        bitrateKbps,
        cached,
        frames,
        renderMs,
        renderedFrames,
      }),
    ),
  };
}

export type PublicExportJob = ReturnType<typeof publicJob>;
