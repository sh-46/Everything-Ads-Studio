import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NotYetAvailable } from "@/components/app/not-yet-available";
import { PageHeader } from "@/components/app/page-header";
import { getProject } from "@/features/projects/queries";
import { requireSession } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Export" };

export default async function ExportPage({ params }: PageProps<"/projects/[projectId]/export">) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) notFound();
  const project = await getProject(await requireSession(), projectId);
  if (!project) notFound();

  return (
    <>
      <PageHeader
        title="Export"
        crumbs={[
          { label: project.brandName, href: `/brands/${project.brandId}` },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Export" },
        ]}
      />
      <NotYetAvailable
        phase="Phase 4 · Export"
        summary="Rendering runs on a separate worker that is not deployed yet. No mock files are produced."
        items={[
          { label: "Individual scene MP4", control: "Render" },
          { label: "Square Feed MP4", control: "Render" },
          { label: "CTA image (PNG / JPG)", control: "Export" },
          { label: "Batch ZIP of all scenes", control: "Export" },
        ]}
      />
    </>
  );
}
