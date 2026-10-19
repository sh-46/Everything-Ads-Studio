import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ASSET_KINDS, assetMetadataSchema } from "@/domain/asset";
import { isDemoMode } from "@/lib/demo/mode";
import { demoAddAsset } from "@/lib/demo/store";
import { readDemoFile } from "./demo-file";

const fieldsSchema = z.object({
  kind: z.enum(ASSET_KINDS),
  brandId: z.uuid(),
  projectId: z.preprocess((v) => (v ? v : null), z.uuid().nullable()),
  displayName: z.preprocess((v) => (v ? v : null), z.string().trim().min(1).max(80).nullable()),
  metadata: z.preprocess((v) => (typeof v === "string" && v ? JSON.parse(v) : {}), assetMetadataSchema),
});

/** Demo Mode only: keeps an uploaded photo, logo or font in dev-server memory. 404 otherwise. */
export async function POST(request: NextRequest) {
  if (!isDemoMode()) return new NextResponse(null, { status: 404 });

  const form = await request.formData();
  let fields;
  try {
    fields = fieldsSchema.safeParse(
      Object.fromEntries(["kind", "brandId", "projectId", "displayName", "metadata"].map((k) => [k, form.get(k)])),
    );
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  if (!fields.success) return NextResponse.json({ error: fields.error.issues[0].message }, { status: 400 });
  const { kind, brandId, projectId, displayName, metadata } = fields.data;
  if ((kind === "photo") !== (projectId !== null)) {
    return NextResponse.json({ error: "Photos belong to projects; logos and fonts to brands." }, { status: 400 });
  }
  if (kind === "font" && !metadata.family)
    return NextResponse.json({ error: "Font family is required." }, { status: 400 });

  const result = await readDemoFile(form, kind);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const asset = demoAddAsset({ ...result.file, kind, brandId, projectId, displayName, metadata });
  if (!asset) return NextResponse.json({ error: "Brand or project not found." }, { status: 404 });
  return NextResponse.json(asset);
}
