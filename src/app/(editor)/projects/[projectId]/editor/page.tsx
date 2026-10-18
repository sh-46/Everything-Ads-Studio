import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { listBrandPhotos } from "@/features/assets/queries";
import { getBrand } from "@/features/brands/queries";
import { EditorShell } from "@/features/editor/components/editor-shell";
import { getProject, listScenes } from "@/features/projects/queries";
import { requireSession } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editor" };

export default async function EditorPage({ params }: PageProps<"/projects/[projectId]/editor">) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) notFound();
  const ctx = await requireSession();
  const project = await getProject(ctx, projectId);
  if (!project) notFound();

  const [brand, scenes, assets] = await Promise.all([
    getBrand(ctx, project.brandId),
    listScenes(ctx, projectId),
    listBrandPhotos(ctx, project.brandId),
  ]);
  if (!brand) notFound();

  return (
    <EditorShell
      workspaceId={project.workspaceId}
      projectId={project.id}
      projectName={project.name}
      brandId={brand.id}
      brandName={brand.name}
      kit={brand.kit}
      scenes={scenes}
      assets={assets}
    />
  );
}
