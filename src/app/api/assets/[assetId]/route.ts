import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAssetRow, signedAssetUrl } from "@/features/assets/queries";
import { isDemoMode } from "@/lib/demo/mode";
import { getSession } from "@/lib/supabase/server";

/** Signed URLs handed out by this route are short-lived; the browser re-requests as needed. */
const SIGNED_TTL_SECONDS = 600;

/**
 * Authorized access to a stored file: the signed-in user must be able to read the asset
 * row (workspace RLS); they're redirected to a short-lived signed Storage URL.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/assets/[assetId]">) {
  const { assetId } = await params;
  if (isDemoMode() || !z.uuid().safeParse(assetId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ctx = await getSession();
  if (!ctx) return NextResponse.json({ error: "Sign in to view this file." }, { status: 401 });
  const row = await getAssetRow(ctx, assetId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = await signedAssetUrl(ctx, row.storage_path, SIGNED_TTL_SECONDS);
  const response = NextResponse.redirect(url, 302);
  // Private (per user); short enough that the cached redirect never outlives the signature.
  response.headers.set("Cache-Control", "private, max-age=300");
  return response;
}
