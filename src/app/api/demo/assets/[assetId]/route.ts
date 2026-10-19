import { NextResponse, type NextRequest } from "next/server";
import { isDemoMode } from "@/lib/demo/mode";
import { demoGetAsset, demoGetAssetFile, demoReplaceAssetFile } from "@/lib/demo/store";
import { readDemoFile } from "../demo-file";

/** Demo Mode only: serves a file uploaded during this dev-server session. 404 otherwise. */
export async function GET(_request: Request, { params }: RouteContext<"/api/demo/assets/[assetId]">) {
  if (!isDemoMode()) return new NextResponse(null, { status: 404 });
  const { assetId } = await params;
  const file = demoGetAssetFile(assetId);
  if (!file) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // SVGs opened directly can't run scripts or load anything.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
    },
  });
}

/** Demo Mode only: replaces the file behind an asset, keeping its id. */
export async function PUT(request: NextRequest, { params }: RouteContext<"/api/demo/assets/[assetId]">) {
  if (!isDemoMode()) return new NextResponse(null, { status: 404 });
  const { assetId } = await params;
  const existing = demoGetAsset(assetId);
  if (!existing) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  const result = await readDemoFile(await request.formData(), existing.kind);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(demoReplaceAssetFile(assetId, result.file));
}
