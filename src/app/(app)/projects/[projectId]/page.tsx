import { PenTool } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { ProjectActions } from "@/features/projects/components/project-actions";
import { ProjectMetaForm } from "@/features/projects/components/project-meta-form";
import { getProject, listScenes } from "@/features/projects/queries";
import { requireSession } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  if (!z.uuid().safeParse(projectId).success) notFound();
  const ctx = await requireSession();
  const project = await getProject(ctx, projectId);
  if (!project) notFound();
  const scenes = await listScenes(ctx, projectId);

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
        <section aria-labelledby="scenes-heading">
          <h2 id="scenes-heading" className="mb-4 text-sm font-semibold">
            Scenes
          </h2>
          <ol className="divide-border border-border divide-y rounded-xl border">
            {scenes.map((scene) => (
              <li key={scene.id} className="flex items-center gap-4 px-4 py-3">
                <span className="text-muted-foreground w-5 text-xs tabular-nums">{scene.position + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{scene.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {scene.document.width}×{scene.document.height} · {scene.document.layers.length} layers ·{" "}
                    {(scene.document.durationMs / 1000).toFixed(1)}s
                  </p>
                </div>
                <span className="text-muted-foreground text-[11px]">rev {scene.revision}</span>
              </li>
            ))}
          </ol>
        </section>

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
              Preview →
            </Link>
            <Link className="text-muted-foreground hover:text-foreground block" href={`/projects/${project.id}/export`}>
              Export →
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
