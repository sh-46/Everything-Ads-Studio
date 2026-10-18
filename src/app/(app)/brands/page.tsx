import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { CreateBrandDialog } from "@/features/brands/components/create-brand-dialog";
import { listBrands } from "@/features/brands/queries";
import { requireSession } from "@/lib/supabase/server";
import { Suspense } from "react";
import PageSkeleton from "@/app/(app)/loading";

export const metadata: Metadata = { title: "Brands" };

async function BrandsPageContent() {
  const ctx = await requireSession();
  const brands = await listBrands(ctx);

  return (
    <>
      <PageHeader title="Brands" description="OEM brands and their Brand Kits." actions={<CreateBrandDialog />} />
      {brands.length === 0 ? (
        <EmptyState
          title="No brands yet"
          description="Create an OEM brand to set up its Brand Kit and start model projects."
          action={<CreateBrandDialog />}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <li key={brand.id}>
              <Link
                href={`/brands/${brand.id}`}
                className="border-border hover:border-foreground/20 hover:bg-muted/40 block rounded-xl border p-5 transition-colors"
              >
                <h2 className="text-base font-semibold tracking-tight">{brand.name}</h2>
                <p className="text-muted-foreground mt-1 text-xs">
                  {brand.projectCount} {brand.projectCount === 1 ? "project" : "projects"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Data loads inside Suspense so navigation shows the skeleton immediately (Cache Components).
export default function BrandsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BrandsPageContent />
    </Suspense>
  );
}
