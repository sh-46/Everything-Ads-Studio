import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import PageSkeleton from "@/app/(app)/loading";
import { PageHeader } from "@/components/app/page-header";
import { buildExportPlan, disclosureReview } from "@/domain/export-plan";
import { referencedAssetIds } from "@/domain/scene-photos";
import { listProjectPhotos } from "@/features/assets/queries";
import { ExportPanel } from "@/features/exports/export-panel";
import { getProject, listScenes } from "@/features/projects/queries";
import { isDemoMode } from "@/lib/demo/mode";
import { requireSession } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Export" };

async function ExportPageContent({ params }: PageProps<"/projects/[projectId]/export">) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) notFound();
  const ctx = await requireSession();
  const project = await getProject(ctx, projectId);
  if (!project) notFound();
  const scenes = await listScenes(ctx, projectId);
  const plan = buildExportPlan(project, scenes);
  const photos = await listProjectPhotos(ctx, projectId, [...referencedAssetIds(scenes.map((s) => s.document))]);
  const review = disclosureReview(plan, scenes, photos);

  return (
    <>
      <PageHeader
        title="Ready to Export"
        description="Preview is optional — you can export straight away. Exports use the last saved version of each scene."
        crumbs={[
          { label: project.brandName, href: `/brands/${project.brandId}` },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Export" },
        ]}
      />
      <ExportPanel projectId={project.id} plan={plan} review={review} demoMode={isDemoMode()} />
    </>
  );
}

// Data loads inside Suspense so navigation shows the skeleton immediately (Cache Components).
export default function ExportPage(props: PageProps<"/projects/[projectId]/export">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExportPageContent {...props} />
    </Suspense>
  );
}
