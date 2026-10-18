import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from "@/domain/asset";
import { isDemoMode } from "@/lib/demo/mode";
import { demoAddUploadedPhoto } from "@/lib/demo/store";

const fieldsSchema = z.object({
  projectId: z.uuid(),
  width: z.coerce.number().int().positive().max(20_000),
  height: z.coerce.number().int().positive().max(20_000),
});

/** Demo Mode only: keeps an uploaded photo in dev-server memory. 404 otherwise. */
export async function POST(request: NextRequest) {
  if (!isDemoMode()) return new NextResponse(null, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  const fields = fieldsSchema.safeParse({
    projectId: form.get("projectId"),
    width: form.get("width"),
    height: form.get("height"),
  });
  if (!(file instanceof File) || !fields.success) {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: "Use JPG, PNG or WebP photos." }, { status: 415 });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "Photos must be 25 MB or smaller." }, { status: 413 });
  }

  const asset = demoAddUploadedPhoto({
    projectId: fields.data.projectId,
    bytes: new Uint8Array(await file.arrayBuffer()),
    mimeType: file.type,
    width: fields.data.width,
    height: fields.data.height,
    originalFilename: file.name.slice(0, 255),
  });
  if (!asset) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json(asset);
}
