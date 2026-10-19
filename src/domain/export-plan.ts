import type { Scene, SceneKind } from "./scene";

/**
 * What the Creative Package contains and what each file is called. Pure so the export
 * page, the job runner and tests share one definition.
 *
 *   {Brand}_{Model}_EverythingAds.zip
 *     Motion_Tile/{Brand}_{Model}_Motion_Tile_1080x1080.mp4   ← the Square Feed scene
 *     Facebook_Build/01_Intro_1080x1920.mp4 … 05_Outro_1080x1620.mp4, 06_CTA_1080x300.png
 */

export type ExportFormat = "mp4" | "png";

export interface ExportItem {
  /** Stable key within a job, e.g. "motion-tile" or "build-03". */
  key: string;
  label: string;
  sceneId: string;
  sceneName: string;
  format: ExportFormat;
  /** Folder inside the ZIP ("" for single-file exports). */
  folder: string;
  filename: string;
  width: number;
  height: number;
  durationMs: number;
}

export interface ExportPlan {
  zipName: string;
  items: ExportItem[];
  /** Expected scenes that are missing from the project (export continues without them). */
  missing: string[];
  /** Extra scenes not in the package (available as individual exports). */
  notIncluded: { sceneId: string; name: string }[];
}

const BUILD_ORDER: { kind: SceneKind; label: string; format: ExportFormat }[] = [
  { kind: "intro", label: "Intro", format: "mp4" },
  { kind: "exterior", label: "Exterior", format: "mp4" },
  { kind: "interior", label: "Interior", format: "mp4" },
  { kind: "performance", label: "Performance", format: "mp4" },
  { kind: "outro", label: "Outro", format: "mp4" },
  { kind: "cta", label: "CTA", format: "png" },
];

/** Letters, digits and dashes only — safe on every filesystem and inside ZIPs. */
export function safeName(value: string, fallback = "Untitled"): string {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

function dims(scene: Scene) {
  return `${scene.document.width}x${scene.document.height}`;
}

function byPosition(a: Scene, b: Scene) {
  return a.position - b.position;
}

export function formatForScene(scene: Scene): ExportFormat {
  return scene.kind === "cta" ? "png" : "mp4";
}

export function buildExportPlan(project: { brandName: string; modelName: string }, scenes: Scene[]): ExportPlan {
  const prefix = `${safeName(project.brandName)}_${safeName(project.modelName)}`;
  const sorted = [...scenes].sort(byPosition);
  const used = new Set<string>();
  const items: ExportItem[] = [];
  const missing: string[] = [];

  const tile = sorted.find((s) => s.kind === "feed");
  if (tile) {
    used.add(tile.id);
    items.push({
      key: "motion-tile",
      label: "Motion Tile",
      sceneId: tile.id,
      sceneName: tile.name,
      format: "mp4",
      folder: "Motion_Tile",
      filename: `${prefix}_Motion_Tile_${dims(tile)}.mp4`,
      width: tile.document.width,
      height: tile.document.height,
      durationMs: tile.document.durationMs,
    });
  } else {
    missing.push("Square Feed (Motion Tile)");
  }

  BUILD_ORDER.forEach(({ kind, label, format }, index) => {
    const scene = sorted.find((s) => s.kind === kind);
    if (!scene) {
      missing.push(label);
      return;
    }
    used.add(scene.id);
    const n = String(index + 1).padStart(2, "0");
    items.push({
      key: `build-${n}`,
      label,
      sceneId: scene.id,
      sceneName: scene.name,
      format,
      folder: "Facebook_Build",
      filename: `${n}_${label}_${dims(scene)}.${format}`,
      width: scene.document.width,
      height: scene.document.height,
      durationMs: scene.document.durationMs,
    });
  });

  return {
    zipName: `${prefix}_EverythingAds.zip`,
    items,
    missing,
    notIncluded: sorted.filter((s) => !used.has(s.id)).map((s) => ({ sceneId: s.id, name: s.name })),
  };
}

/** A single-scene export uses the same naming as the package where possible. */
export function singleExportItem(project: { brandName: string; modelName: string }, scene: Scene): ExportItem {
  const planned = buildExportPlan(project, [scene]).items.find((i) => i.sceneId === scene.id);
  if (planned) return { ...planned, folder: "" };
  const format = formatForScene(scene);
  return {
    key: "single",
    label: scene.name,
    sceneId: scene.id,
    sceneName: scene.name,
    format,
    folder: "",
    filename: `${safeName(project.brandName)}_${safeName(project.modelName)}_${safeName(scene.name)}_${dims(scene)}.${format}`,
    width: scene.document.width,
    height: scene.document.height,
    durationMs: scene.document.durationMs,
  };
}
