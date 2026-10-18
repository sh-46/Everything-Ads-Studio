"use client";

import { useEffect, useState } from "react";

type ImageState = { status: "idle" | "loading" | "error"; image: null } | { status: "loaded"; image: HTMLImageElement };

const cache = new Map<string, HTMLImageElement>();

/**
 * Loads an image for canvas drawing. `crossOrigin` keeps the canvas untainted so it can
 * be exported later. Cached by asset id because signed URLs change on refresh.
 */
export function useImageElement(cacheKey: string | null, url: string | null): ImageState {
  const [settled, setSettled] = useState<{ key: string; image: HTMLImageElement | null } | null>(null);

  useEffect(() => {
    if (!cacheKey || !url || cache.has(cacheKey)) return;
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      cache.set(cacheKey, img);
      if (!cancelled) setSettled({ key: cacheKey, image: img });
    };
    img.onerror = () => {
      if (!cancelled) setSettled({ key: cacheKey, image: null });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [cacheKey, url]);

  if (!cacheKey || !url) return { status: "idle", image: null };
  const hit = cache.get(cacheKey);
  if (hit) return { status: "loaded", image: hit };
  if (settled?.key === cacheKey && !settled.image) return { status: "error", image: null };
  return { status: "loading", image: null };
}
