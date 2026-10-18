import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { BrandKitForm } from "@/features/brands/components/brand-kit-form";
import { getBrand } from "@/features/brands/queries";
import { requireSession } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Brand Kit" };

export default async function BrandSettingsPage({ params }: PageProps<"/brands/[brandId]/settings">) {
  const { brandId } = await params;
  if (!z.uuid().safeParse(brandId).success) notFound();
  const brand = await getBrand(await requireSession(), brandId);
  if (!brand) notFound();

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
      />
    </>
  );
}
