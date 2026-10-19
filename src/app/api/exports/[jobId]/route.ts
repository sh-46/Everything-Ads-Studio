import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { getJob, publicJob, zipPath } from "@/server/export/jobs";
import { getSession } from "@/lib/supabase/server";

/** Current job state (status, stage, per-asset progress) for polling. */
export async function GET(_request: Request, { params }: RouteContext<"/api/exports/[jobId]">) {
  const { jobId } = await params;
  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: "Your session expired. Sign in again to export." }, { status: 401 });
  const job = getJob(jobId);
  if (!job || job.ownerId !== ctx.userId) return NextResponse.json({ error: "Export not found." }, { status: 404 });
  const view = publicJob(job);
  const zip = zipPath(job);
  if (job.status === "ready" && zip) view.zipBytes = (await fs.stat(zip).catch(() => null))?.size ?? null;
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
