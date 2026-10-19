import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import PageSkeleton from "@/app/(app)/loading";
import { PageHeader } from "@/components/app/page-header";
import { buildExportPlan } from "@/domain/export-plan";
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
  const plan = buildExportPlan(project, await listScenes(ctx, projectId));

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
      <ExportPanel projectId={project.id} plan={plan} demoMode={isDemoMode()} />
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
