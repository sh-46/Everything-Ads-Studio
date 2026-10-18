import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NotYetAvailable } from "@/components/app/not-yet-available";
import { PageHeader } from "@/components/app/page-header";
import { getProject } from "@/features/projects/queries";
import { requireSession } from "@/lib/supabase/server";
import { Suspense } from "react";
import PageSkeleton from "@/app/(app)/loading";

export const metadata: Metadata = { title: "Preview" };

async function PreviewPageContent({ params }: PageProps<"/projects/[projectId]/preview">) {
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

// Data loads inside Suspense so navigation shows the skeleton immediately (Cache Components).
export default function PreviewPage(props: PageProps<"/projects/[projectId]/preview">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PreviewPageContent {...props} />
    </Suspense>
  );
}
