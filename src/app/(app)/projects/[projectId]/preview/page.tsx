import { Package, PenTool } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import PageSkeleton from "@/app/(app)/loading";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { referencedAssetIds } from "@/domain/scene-photos";
import { listBrandKitAssets, listProjectPhotos } from "@/features/assets/queries";
import { ExperiencePreview } from "@/features/preview/experience-preview";
import { getProject, listScenes } from "@/features/projects/queries";
import { requireSession } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Preview" };

async function PreviewPageContent({ params }: PageProps<"/projects/[projectId]/preview">) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) notFound();
  const ctx = await requireSession();
  const project = await getProject(ctx, projectId);
  if (!project) notFound();
  const scenes = await listScenes(ctx, projectId);
  const [photos, kitAssets] = await Promise.all([
    listProjectPhotos(ctx, projectId, [...referencedAssetIds(scenes.map((s) => s.document))]),
    listBrandKitAssets(ctx, project.brandId),
  ]);

  return (
    <>
      <PageHeader
        title="Preview"
        description="Optional — preview the Motion Tile in a mobile feed and the Facebook Build, or skip straight to export."
        crumbs={[
          { label: project.brandName, href: `/brands/${project.brandId}` },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Preview" },
        ]}
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link href={`/projects/${project.id}/editor`}>
                <PenTool /> Open editor
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/projects/${project.id}/export`}>
                <Package /> Export Creative Package
              </Link>
            </Button>
          </>
        }
      />
      <ExperiencePreview
        scenes={scenes}
        assets={[...photos, ...kitAssets]}
        brandName={project.brandName}
        projectName={project.name}
      />
    </>
  );
}

// Data loads inside Suspense so navigation shows the skeleton immediately (Cache Components).
export default function PreviewPage(props: PageProps<"/projects/[projectId]/preview">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PreviewPageContent {...props} />
    </Suspense>
  );
}
