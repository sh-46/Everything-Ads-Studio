import "server-only";

import { createHash } from "node:crypto";
import { brandFontsFromAssets, photoDisclosureText, type Asset } from "@/domain/asset";
import { disclosureIssues } from "@/domain/disclosures";
import { MP4_SETTINGS } from "@/domain/export-settings";
import { isSystemFont } from "@/domain/fonts";
import type { Scene } from "@/domain/scene";
import type { RenderInput } from "./renderer";

export interface PreparedScene {
  input: RenderInput;
  /** Problems that make the export wrong (e.g. a deleted photo) — the item fails. */
  errors: string[];
  /** Renders, but not exactly as designed (e.g. a missing font falls back). */
  warnings: string[];
  /** Same design + same files → same key → the previous render is reused. */
  cacheKey: string;
}

/** Bump when rendering output changes in a way cached files shouldn't survive. */
const RENDER_VERSION = "3";

/**
 * The render browser loads assets over HTTP, so relative URLs (Demo Mode's
 * /api/demo/assets/…) are made absolute against the app's own origin. Signed storage
 * URLs and data: URLs are used as-is. Browser-only blob: URLs are never involved.
 */
function absolute(url: string, origin: string): string {
  return url.startsWith("/") ? `${origin}${url}` : url;
}

/** Identity of a file for caching: signed-URL tokens change, the stored path doesn't. */
function stableUrl(url: string): string {
  if (url.startsWith("data:")) return createHash("sha256").update(url).digest("hex");
  return url.startsWith("/") ? url : url.split("?")[0];
}

export function prepareScene(scene: Scene, assets: Asset[], origin: string, format: "mp4" | "png"): PreparedScene {
  const doc = scene.document;
  const byId = new Map(assets.map((a) => [a.id, a]));
  const errors: string[] = [];
  const warnings: string[] = [];
  const used: Asset[] = [];

  for (const layer of doc.layers) {
    if (!layer.visible || (layer.type !== "image" && layer.type !== "logo") || !layer.assetId) continue;
    const asset = byId.get(layer.assetId);
    if (!asset) {
      errors.push(
        `“${layer.name}” in ${scene.name} uses a ${layer.type === "logo" ? "logo" : "photo"} that no longer exists. Replace or remove it, then export again.`,
      );
    } else if (!used.includes(asset)) {
      used.push(asset);
    }
  }

  // Disclosure layers read their wording from the linked photo.
  for (const layer of doc.layers) {
    const asset = layer.type === "text" && layer.disclosure ? byId.get(layer.disclosure.assetId) : undefined;
    if (asset && !used.includes(asset)) used.push(asset);
  }
  // Never omit a required disclosure silently: every review finding travels with the file.
  for (const issue of disclosureIssues(doc, byId)) {
    warnings.push(
      `${issue.severity === "error" ? "Disclosure problem" : "Disclosure check"} in ${scene.name}: ${issue.message}`,
    );
  }

  const brandFonts = brandFontsFromAssets(assets);
  const families = new Set(
    doc.layers.filter((l) => l.visible && l.type === "text").map((l) => (l.type === "text" ? l.fontFamily : "")),
  );
  for (const family of families) {
    if (!isSystemFont(family) && !brandFonts.some((f) => f.family === family)) {
      warnings.push(`Font “${family}” in ${scene.name} isn’t in the Brand Kit, so a fallback font is used.`);
    }
  }
  const fonts = brandFonts.filter((f) => families.has(f.family));

  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify({
        v: RENDER_VERSION,
        settings: format === "mp4" ? MP4_SETTINGS : null,
        format,
        doc,
        assets: used.map((a) => ({
          id: a.id,
          url: stableUrl(a.url),
          w: a.width,
          h: a.height,
          disclosure: photoDisclosureText(a),
        })),
        fonts: fonts.map((f) => ({ ...f, url: stableUrl(f.url) })),
      }),
    )
    .digest("hex");

  return {
    input: {
      document: doc,
      assets: used.map((a) => ({ ...a, url: absolute(a.url, origin) })),
      fonts: fonts.map((f) => ({ ...f, url: absolute(f.url, origin) })),
    },
    errors,
    warnings,
    cacheKey,
  };
}
