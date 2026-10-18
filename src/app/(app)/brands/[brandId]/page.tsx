import { Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { getBrand } from "@/features/brands/queries";
import { CreateProjectDialog } from "@/features/projects/components/create-project-dialog";
import { ProjectCard } from "@/features/projects/components/project-card";
import { listProjects } from "@/features/projects/queries";
import { requireSession } from "@/lib/supabase/server";
import { z } from "zod";

export const metadata: Metadata = { title: "Brand" };

export default async function BrandPage({ params }: PageProps<"/brands/[brandId]">) {
  const { brandId } = await params;
  if (!z.uuid().safeParse(brandId).success) notFound();
  const ctx = await requireSession();
  const brand = await getBrand(ctx, brandId);
  if (!brand) notFound();
  const projects = await listProjects(ctx, { brandId });
  const { colors, typography } = brand.kit;

  return (
    <>
      <PageHeader
        title={brand.name}
        crumbs={[{ label: "Brands", href: "/brands" }, { label: brand.name }]}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/brands/${brand.id}/settings`}>
                <Settings /> Brand Kit
              </Link>
            </Button>
            <CreateProjectDialog brandId={brand.id} brandName={brand.name} />
          </>
        }
      />

      <section
        aria-label="Brand Kit summary"
        className="border-border mb-10 flex flex-wrap items-center gap-6 rounded-xl border p-4"
      >
        <div className="flex gap-1.5">
          {[colors.background, colors.primary, colors.accent, colors.text].map((c, i) => (
            <span key={i} className="border-border size-6 rounded-md border" style={{ background: c }} title={c} />
          ))}
        </div>
        <p className="text-sm">
          <span style={{ fontFamily: typography.headline.fontFamily, fontWeight: typography.headline.fontWeight }}>
            {typography.headline.fontFamily}
          </span>
          <span className="text-muted-foreground">
            {" "}
            · headline {typography.headline.fontSize}px / {typography.headline.fontWeight}
          </span>
        </p>
        <Link
          href={`/brands/${brand.id}/settings`}
          className="text-muted-foreground hover:text-foreground ml-auto text-xs"
        >
          Edit Brand Kit →
        </Link>
      </section>

      <h2 className="mb-4 text-sm font-semibold">Model projects</h2>
      {projects.length === 0 ? (
        <EmptyState
          title="No model projects yet"
          description={`Create a project such as “2026 ${brand.name} …” to start building scenes.`}
          action={<CreateProjectDialog brandId={brand.id} brandName={brand.name} />}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} showBrand={false} />
          ))}
        </div>
      )}
    </>
  );
}
