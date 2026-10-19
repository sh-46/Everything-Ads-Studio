import { PenTool } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { ProjectActions } from "@/features/projects/components/project-actions";
import { ProjectMetaForm } from "@/features/projects/components/project-meta-form";
import { referencedAssetIds } from "@/domain/scene-photos";
import { listProjectPhotos } from "@/features/assets/queries";
import { ScenesOverview } from "@/features/projects/components/scenes-overview";
import { getProject, listScenes } from "@/features/projects/queries";
import { isDemoMode } from "@/lib/demo/mode";
import { requireSession } from "@/lib/supabase/server";
import { Suspense } from "react";
import PageSkeleton from "@/app/(app)/loading";

export const metadata: Metadata = { title: "Project" };

async function ProjectPageContent({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) notFound();
  const ctx = await requireSession();
  const project = await getProject(ctx, projectId);
  if (!project) notFound();
  const scenes = await listScenes(ctx, projectId);
  const photos = await listProjectPhotos(ctx, projectId, [...referencedAssetIds(scenes.map((s) => s.document))]);

  return (
    <>
      <PageHeader
        title={project.name}
        description={`${project.modelYear} ${project.modelName} · ${project.brandName}`}
        crumbs={[
          { label: "Brands", href: "/brands" },
          { label: project.brandName, href: `/brands/${project.brandId}` },
          { label: project.name },
        ]}
        actions={
          <Button asChild size="sm">
            <Link href={`/projects/${project.id}/editor`}>
              <PenTool /> Open editor
            </Link>
          </Button>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <ScenesOverview
          projectId={project.id}
          scenes={scenes}
          photos={photos}
          demoMode={isDemoMode()}
          target={{
            workspaceId: project.workspaceId,
            brandId: project.brandId,
            projectId: project.id,
            demoMode: isDemoMode(),
          }}
        />

        <aside className="space-y-8">
          <section aria-labelledby="details-heading">
            <h2 id="details-heading" className="mb-4 text-sm font-semibold">
              Details
            </h2>
            <ProjectMetaForm
              projectId={project.id}
              initial={{ name: project.name, modelYear: project.modelYear, modelName: project.modelName }}
            />
          </section>
          <section aria-labelledby="manage-heading">
            <h2 id="manage-heading" className="mb-4 text-sm font-semibold">
              Manage
            </h2>
            <ProjectActions
              projectId={project.id}
              projectName={project.name}
              status={project.status}
              archived={Boolean(project.archivedAt)}
            />
          </section>
          <section className="space-y-2 text-sm">
            <Link
              className="text-muted-foreground hover:text-foreground block"
              href={`/projects/${project.id}/preview`}
            >
              Scene & full experience preview →
            </Link>
            <Link className="text-muted-foreground hover:text-foreground block" href={`/projects/${project.id}/export`}>
              Export (Phase 4) →
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}

// Data loads inside Suspense so navigation shows the skeleton immediately (Cache Components).
export default function ProjectPage(props: PageProps<"/projects/[projectId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProjectPageContent {...props} />
    </Suspense>
  );
}
