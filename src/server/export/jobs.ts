import "server-only";

import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Zip, ZipPassThrough } from "fflate";
import type { Asset } from "@/domain/asset";
import type { ExportItem } from "@/domain/export-plan";
import type { Scene } from "@/domain/scene";
import { measuredBitrateKbps } from "@/domain/export-settings";
import { prepareScene } from "./inputs";
import { prepareRenderer, renderPng, renderVideo } from "./renderer";

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
  finishedAt: number | null;
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
    })),
    createdAt: Date.now(),
    finishedAt: null,
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
    if (item.status === "failed") Object.assign(item, { status: "queued", progress: 0, error: null });
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
    for (const item of job.items) {
      if (item.status === "done") continue;
      await renderItem(job, item, context);
    }

    const failed = job.items.filter((i) => i.status === "failed");
    if (failed.length > 0) {
      throw new Error(
        `${failed.length} of ${job.items.length} ${job.items.length === 1 ? "asset" : "assets"} failed to render.`,
      );
    }

    if (job.kind === "package") {
      job.status = "packaging";
      job.stage = "Packaging ZIP";
      await writeZip(job);
    }
    job.status = "ready";
    job.stage = "Ready to download";
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.stage = "Export failed";
  } finally {
    job.finishedAt = Date.now();
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
      if (item.format === "png") {
        await renderPng(prepared.input, temp);
      } else {
        await renderVideo(prepared.input, temp, (p) => {
          item.progress = Math.min(0.99, p);
        });
      }
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

/** Streams every rendered file into the ZIP (stored, not recompressed: MP4/PNG are compressed). */
async function writeZip(job: ExportJob) {
  const out = zipPath(job)!;
  const handle = await fs.open(out, "w");
  try {
    await new Promise<void>((resolve, reject) => {
      const writes: Promise<unknown>[] = [];
      const zip = new Zip((error, chunk, final) => {
        if (error) return reject(error);
        writes.push(handle.write(chunk));
        if (final) Promise.all(writes).then(() => resolve(), reject);
      });
      (async () => {
        const names = new Set<string>();
        for (const item of job.items) {
          let name = item.folder ? `${item.folder}/${item.filename}` : item.filename;
          // Never overwrite: disambiguate any duplicate names.
          for (let n = 2; names.has(name); n++) name = name.replace(/(\.[a-z0-9]+)$/i, `-${n}$1`);
          names.add(name);
          const entry = new ZipPassThrough(name);
          zip.add(entry);
          for await (const chunk of createReadStream(itemPath(job, item))) entry.push(chunk as Uint8Array);
          entry.push(new Uint8Array(0), true);
        }
        zip.end();
      })().catch(reject);
    });
  } finally {
    await handle.close();
  }
  const stat = await fs.stat(out);
  if (stat.size === 0) throw new Error("ZIP file is empty.");
}

/** Public, serializable view of a job (no file paths). */
export function publicJob(job: ExportJob) {
  const total = job.items.length;
  const done = job.items.reduce(
    (sum, i) => sum + (i.status === "done" ? 1 : i.status === "rendering" ? i.progress : 0),
    0,
  );
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    error: job.error,
    zipName: job.zipName,
    progress: job.status === "ready" ? 1 : total ? done / total : 0,
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
      }),
    ),
  };
}

export type PublicExportJob = ReturnType<typeof publicJob>;
