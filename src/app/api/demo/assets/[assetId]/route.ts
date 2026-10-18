import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/demo/mode";
import { demoGetUploadedPhoto } from "@/lib/demo/store";

/** Demo Mode only: serves a photo uploaded during this dev-server session. 404 otherwise. */
export async function GET(_request: Request, { params }: RouteContext<"/api/demo/assets/[assetId]">) {
  if (!isDemoMode()) return new NextResponse(null, { status: 404 });
  const { assetId } = await params;
  const photo = demoGetUploadedPhoto(assetId);
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(photo.bytes), {
    headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=3600" },
  });
}
