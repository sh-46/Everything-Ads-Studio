import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NotYetAvailable } from "@/components/app/not-yet-available";
import { PageHeader } from "@/components/app/page-header";
import { getProject } from "@/features/projects/queries";
import { requireSession } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Preview" };

export default async function PreviewPage({ params }: PageProps<"/projects/[projectId]/preview">) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) notFound();
  const project = await getProject(await requireSession(), projectId);
  if (!project) notFound();

  return (
    <>
      <PageHeader
        title="Preview"
        crumbs={[
          { label: project.brandName, href: `/brands/${project.brandId}` },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Preview" },
        ]}
      />
      <NotYetAvailable
        phase="Phase 3 · Motion"
        summary="Animated preview needs the Remotion motion engine, which is not built yet. The editor canvas shows the static layout."
        items={[
          { label: "Scene preview with play, pause, restart and scrub", control: "Play" },
          { label: "Full experience preview in a mobile mockup", control: "Open" },
          { label: "Outro + CTA combined preview", control: "Open" },
        ]}
      />
    </>
  );
}
