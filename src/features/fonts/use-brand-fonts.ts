"use client";

import { useEffect, useMemo, useState } from "react";
import type { BrandFont } from "@/domain/asset";

export type FontLoadStatus = "loading" | "loaded" | "error";

/** One FontFace per file URL for the lifetime of the page. */
const registry = new Map<string, { face: FontFace; promise: Promise<FontFace> }>();

/** Family/weight/style are part of the key: correcting a family registers it anew. */
function fontKey(font: BrandFont): string {
  return `${font.assetId}|${font.url}|${font.family}|${font.weight}|${font.style}`;
}

function register(font: BrandFont) {
  const key = fontKey(font);
  const existing = registry.get(key);
  if (existing) return existing.promise;
  const face = new FontFace(font.family, `url("${font.url}")`, {
    weight: String(font.weight),
    style: font.style,
    display: "block",
  });
  const promise = face.load().then((loaded) => {
    document.fonts.add(loaded);
    return loaded;
  });
  registry.set(key, { face, promise });
  return promise;
}

/**
 * Loads a brand's uploaded fonts with the FontFace API so the canvas and the Remotion
 * preview draw with the real files. `version` changes whenever a font finishes loading,
 * which callers use to re-measure canvas text.
 */
export function useBrandFonts(fonts: BrandFont[]): { status: Record<string, FontLoadStatus>; version: number } {
  const [settled, setSettled] = useState<Record<string, FontLoadStatus>>({});
  const signature = fonts.map(fontKey).join(",");

  useEffect(() => {
    let cancelled = false;
    for (const font of fonts) {
      const key = fontKey(font);
      register(font).then(
        () => !cancelled && setSettled((s) => (s[key] === "loaded" ? s : { ...s, [key]: "loaded" })),
        () => !cancelled && setSettled((s) => ({ ...s, [key]: "error" })),
      );
    }
    return () => {
      cancelled = true;
    };
    // `signature` captures the identity of `fonts`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return useMemo(() => {
    const status: Record<string, FontLoadStatus> = {};
    for (const font of fonts) {
      const s = settled[fontKey(font)] ?? "loading";
      // A family is usable if any of its files loaded; report the worst otherwise.
      const prev = status[font.family];
      status[font.family] =
        prev === "loaded" || s === "loaded" ? "loaded" : prev === "error" || s === "error" ? "error" : "loading";
    }
    return { status, version: Object.values(settled).filter((s) => s === "loaded").length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, signature]);
}
