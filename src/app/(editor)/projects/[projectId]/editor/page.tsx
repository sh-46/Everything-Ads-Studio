import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { referencedAssetIds } from "@/domain/scene-photos";
import { listBrandKitAssets, listProjectPhotos } from "@/features/assets/queries";
import { getBrand } from "@/features/brands/queries";
import { EditorShell } from "@/features/editor/components/editor-shell";
import { getProject, listScenes } from "@/features/projects/queries";
import { isDemoMode } from "@/lib/demo/mode";
import { requireSession } from "@/lib/supabase/server";
import { Suspense } from "react";
import EditorSkeleton from "@/app/(editor)/loading";

export const metadata: Metadata = { title: "Editor" };

async function EditorPageContent({ params, searchParams }: PageProps<"/projects/[projectId]/editor">) {
  const { projectId } = await params;
  const { scene: requestedScene } = await searchParams;
  if (!z.uuid().safeParse(projectId).success) notFound();
  const ctx = await requireSession();
  const project = await getProject(ctx, projectId);
  if (!project) notFound();

  const [brand, scenes, kitAssets] = await Promise.all([
    getBrand(ctx, project.brandId),
    listScenes(ctx, projectId),
    listBrandKitAssets(ctx, project.brandId),
  ]);
  // Project photos, plus same-brand photos its scenes reference (e.g. after duplication).
  const photos = await listProjectPhotos(ctx, projectId, [...referencedAssetIds(scenes.map((s) => s.document))]);
  const assets = [...photos, ...kitAssets];
  if (!brand) notFound();

  return (
    <EditorShell
      workspaceId={project.workspaceId}
      demoMode={isDemoMode()}
      projectId={project.id}
      projectName={project.name}
      brandId={brand.id}
      brandName={brand.name}
      kit={brand.kit}
      scenes={scenes}
      initialSceneId={typeof requestedScene === "string" ? requestedScene : undefined}
      assets={assets}
    />
  );
}

// Data loads inside Suspense so navigation shows the skeleton immediately (Cache Components).
export default function EditorPage(props: PageProps<"/projects/[projectId]/editor">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <EditorPageContent {...props} />
    </Suspense>
  );
}
