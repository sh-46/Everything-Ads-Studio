import { NextResponse } from "next/server";
import { getJob, publicJob, retryJob } from "@/server/export/jobs";
import { getSession } from "@/lib/supabase/server";

/** Re-renders the failed assets of a failed job; finished assets are reused. */
export async function POST(_request: Request, { params }: RouteContext<"/api/exports/[jobId]/retry">) {
  const { jobId } = await params;
  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: "Your session expired. Sign in again to export." }, { status: 401 });
  const job = getJob(jobId);
  if (!job || job.ownerId !== ctx.userId) return NextResponse.json({ error: "Export not found." }, { status: 404 });
  return NextResponse.json(publicJob(retryJob(jobId)!));
}
