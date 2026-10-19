import { NextResponse } from "next/server";
import { getJob, publicJob, retryJob } from "@/server/export/jobs";
import { requireSession } from "@/lib/supabase/server";

/** Re-renders the failed assets of a failed job; finished assets are reused. */
export async function POST(_request: Request, { params }: RouteContext<"/api/exports/[jobId]/retry">) {
  const { jobId } = await params;
  const ctx = await requireSession();
  const job = getJob(jobId);
  if (!job || job.ownerId !== ctx.userId) return NextResponse.json({ error: "Export not found." }, { status: 404 });
  return NextResponse.json(publicJob(retryJob(jobId)!));
}
