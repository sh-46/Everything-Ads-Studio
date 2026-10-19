"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicExportJob } from "@/server/export/jobs";

const ACTIVE = new Set(["queued", "preparing", "rendering", "packaging"]);

export function isActive(job: PublicExportJob | null): boolean {
  return Boolean(job && ACTIVE.has(job.status));
}

/**
 * Starts an export and follows its real server-side state (no simulated progress).
 * Polls while the job is active; the server dedupes repeated starts of the same export.
 */
export function useExportJob(projectId: string, sceneId?: string) {
  const [job, setJob] = useState<PublicExportJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  /** Bumped to (re)start following a job. */
  const [follow, setFollow] = useState<{ id: string; n: number } | null>(null);

  // Follow the job while it's active; stops on ready/failed or unmount.
  useEffect(() => {
    if (!follow) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const response = await fetch(`/api/exports/${follow.id}`, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Could not read export status.");
        if (stopped) return;
        setJob(body);
        if (ACTIVE.has(body.status)) timer = setTimeout(tick, 1000);
      } catch (e) {
        if (stopped) return;
        setError(e instanceof Error ? e.message : "Lost connection to the export.");
        timer = setTimeout(tick, 3000);
      }
    };
    timer = setTimeout(tick, 500);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [follow]);

  const start = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, sceneId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not start the export.");
      setJob(body);
      setFollow((f) => ({ id: body.id, n: (f?.n ?? 0) + 1 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the export.");
    } finally {
      setStarting(false);
    }
  }, [projectId, sceneId]);

  const retry = useCallback(async () => {
    if (!job) return;
    setError(null);
    const response = await fetch(`/api/exports/${job.id}/retry`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Could not retry.");
      return;
    }
    setJob(body);
    setFollow((f) => ({ id: body.id, n: (f?.n ?? 0) + 1 }));
  }, [job]);

  return { job, error, starting, start, retry, active: isActive(job) || starting };
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function downloadUrl(job: PublicExportJob, itemKey?: string): string {
  return `/api/exports/${job.id}/download${itemKey ? `?item=${encodeURIComponent(itemKey)}` : ""}`;
}
