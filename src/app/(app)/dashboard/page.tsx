import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { CreateBrandDialog } from "@/features/brands/components/create-brand-dialog";
import { listBrands } from "@/features/brands/queries";
import { ProjectCard } from "@/features/projects/components/project-card";
import { ProjectFilters } from "@/features/projects/components/project-filters";
import { listProjects } from "@/features/projects/queries";
import { requireSession } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const { q, brand, archived } = await searchParams;
  const ctx = await requireSession();
  const brands = await listBrands(ctx);
  const filtering = typeof q === "string" || typeof brand === "string";
  const projects = await listProjects(ctx, {
    search: typeof q === "string" ? q : undefined,
    brandId: typeof brand === "string" && brands.some((b) => b.id === brand) ? brand : undefined,
    includeArchived: archived === "1",
    limit: 60,
  });

  if (brands.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" description="Recently edited model projects across your OEM brands." />
        <EmptyState
          title="Start with an OEM brand"
          description="Brands hold the Brand Kit — typography, colors and defaults — that every model project inherits."
          action={<CreateBrandDialog />}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Recently edited model projects across your OEM brands."
        actions={<CreateBrandDialog variant="outline" />}
      />
      <div className="grid gap-10 lg:grid-cols-[1fr_220px]">
        <section aria-labelledby="recent-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="recent-heading" className="text-sm font-semibold">
              {filtering ? "Matching projects" : "Recent projects"}
            </h2>
            <ProjectFilters brands={brands.map((b) => ({ id: b.id, name: b.name }))} />
          </div>
          {projects.length === 0 ? (
            <EmptyState
              title={filtering ? "No matching projects" : "No projects yet"}
              description={
                filtering ? "Try a different search or brand." : "Open a brand to create its first model project."
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </section>
        <aside aria-labelledby="brands-heading">
          <h2 id="brands-heading" className="mb-4 text-sm font-semibold">
            Brands
          </h2>
          <ul className="space-y-1">
            {brands.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/brands/${b.id}`}
                  className="hover:bg-muted flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
                >
                  <span className="truncate">{b.name}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">{b.projectCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}
