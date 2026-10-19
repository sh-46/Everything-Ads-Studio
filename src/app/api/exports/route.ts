import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { buildExportPlan, singleExportItem } from "@/domain/export-plan";
import { referencedAssetIds } from "@/domain/scene-photos";
import { listBrandKitAssets, listProjectPhotos, signAssetsForRender } from "@/features/assets/queries";
import { getProject, listScenes } from "@/features/projects/queries";
import { createJob, publicJob } from "@/server/export/jobs";
import { getSession } from "@/lib/supabase/server";

const bodySchema = z.object({
  projectId: z.uuid(),
  /** Omit for the full Creative Package; set to export one scene. */
  sceneId: z.uuid().optional(),
});

/** Starts an export job from the saved project state. Returns the job to poll. */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid export request." }, { status: 400 });
  const { projectId, sceneId } = parsed.data;

  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: "Your session expired. Sign in again to export." }, { status: 401 });
  const project = await getProject(ctx, projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const scenes = await listScenes(ctx, projectId);
  const [photos, kitAssets] = await Promise.all([
    listProjectPhotos(ctx, projectId, [...referencedAssetIds(scenes.map((s) => s.document))]),
    listBrandKitAssets(ctx, project.brandId),
  ]);

  let items;
  let zipName: string | null = null;
  if (sceneId) {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return NextResponse.json({ error: "Scene not found." }, { status: 404 });
    items = [singleExportItem(project, scene)];
  } else {
    const plan = buildExportPlan(project, scenes);
    if (plan.items.length === 0)
      return NextResponse.json({ error: "This project has no scenes to export." }, { status: 400 });
    items = plan.items;
    zipName = plan.zipName;
  }

  const job = createJob({
    ownerId: ctx.userId,
    projectId,
    kind: sceneId ? "single" : "package",
    requestKey: `${projectId}:${sceneId ?? "package"}`,
    zipName,
    items,
    scenes,
    // The render browser has no session: give it signed Storage URLs (demo: unchanged).
    assets: await signAssetsForRender(ctx, [...photos, ...kitAssets]),
    // The render browser fetches project files from this same server.
    origin: request.nextUrl.origin,
  });
  return NextResponse.json(publicJob(job), { status: 202 });
}
