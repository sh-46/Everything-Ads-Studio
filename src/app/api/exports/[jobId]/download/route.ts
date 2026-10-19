import { createReadStream, promises as fs } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { getJob, itemPath, zipPath } from "@/server/export/jobs";
import { requireSession } from "@/lib/supabase/server";

const TYPES: Record<string, string> = { mp4: "video/mp4", png: "image/png", zip: "application/zip" };

/**
 * Downloads the package ZIP, or one rendered file with ?item=<key>. Paths come from the
 * job record only (never from the request), so nothing outside the job folder is served.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/exports/[jobId]/download">) {
  const { jobId } = await params;
  const ctx = await requireSession();
  const job = getJob(jobId);
  if (!job || job.ownerId !== ctx.userId) return NextResponse.json({ error: "Export not found." }, { status: 404 });

  const itemKey = request.nextUrl.searchParams.get("item");
  let file: string | null;
  let name: string;
  if (itemKey) {
    const item = job.items.find((i) => i.key === itemKey);
    if (!item || item.status !== "done") return NextResponse.json({ error: "File not ready." }, { status: 404 });
    file = itemPath(job, item);
    name = item.filename;
  } else {
    if (job.status !== "ready" || job.kind !== "package") {
      return NextResponse.json({ error: "Package not ready." }, { status: 409 });
    }
    file = zipPath(job);
    name = job.zipName ?? "export.zip";
  }
  const stat = file ? await fs.stat(file).catch(() => null) : null;
  if (!file || !stat) return NextResponse.json({ error: "File expired. Export again." }, { status: 410 });

  const ext = name.split(".").pop() ?? "";
  return new NextResponse(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
