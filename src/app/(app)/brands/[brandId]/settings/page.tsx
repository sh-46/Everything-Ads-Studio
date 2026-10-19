import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { BrandKitForm } from "@/features/brands/components/brand-kit-form";
import { getBrand } from "@/features/brands/queries";
import { listBrandKitAssets } from "@/features/assets/queries";
import { isDemoMode } from "@/lib/demo/mode";
import { requireSession } from "@/lib/supabase/server";
import { Suspense } from "react";
import PageSkeleton from "@/app/(app)/loading";

export const metadata: Metadata = { title: "Brand Kit" };

async function BrandSettingsPageContent({ params }: PageProps<"/brands/[brandId]/settings">) {
  const { brandId } = await params;
  if (!z.uuid().safeParse(brandId).success) notFound();
  const ctx = await requireSession();
  const brand = await getBrand(ctx, brandId);
  if (!brand) notFound();
  const assets = await listBrandKitAssets(ctx, brand.id);

  return (
    <>
      <PageHeader
        title="Brand Kit"
        description={`Typography, colors and defaults for ${brand.name}. Other brands are unaffected.`}
        crumbs={[
          { label: "Brands", href: "/brands" },
          { label: brand.name, href: `/brands/${brand.id}` },
          { label: "Brand Kit" },
        ]}
      />
      <BrandKitForm
        brandId={brand.id}
        brandName={brand.name}
        initialKit={brand.kit}
        initialRevision={brand.kitRevision}
        initialAssets={assets}
        demoMode={isDemoMode()}
        target={{ workspaceId: ctx.workspaceId, brandId: brand.id, projectId: null, demoMode: isDemoMode() }}
      />
    </>
  );
}

// Data loads inside Suspense so navigation shows the skeleton immediately (Cache Components).
export default function BrandSettingsPage(props: PageProps<"/brands/[brandId]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BrandSettingsPageContent {...props} />
    </Suspense>
  );
}
