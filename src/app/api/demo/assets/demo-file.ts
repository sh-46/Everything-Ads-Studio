import "server-only";

import { z } from "zod";
import { ALLOWED_MIME, MAX_BYTES, validateAssetContent, type AssetKind } from "@/domain/asset";

const dimension = z.preprocess(
  (v) => (v === null || v === "" || v === undefined ? null : v),
  z.coerce.number().int().positive().max(20_000).nullable(),
);

export const fileFieldsSchema = z.object({ width: dimension, height: dimension, mimeType: z.string().min(1) });

/** Reads and validates the uploaded file from a Demo Mode form post. */
export async function readDemoFile(form: FormData, kind: AssetKind) {
  const file = form.get("file");
  const fields = fileFieldsSchema.safeParse({
    width: form.get("width"),
    height: form.get("height"),
    mimeType: form.get("mimeType"),
  });
  if (!(file instanceof File) || !fields.success) return { error: "Invalid upload.", status: 400 } as const;
  const { mimeType, width, height } = fields.data;
  if (!ALLOWED_MIME[kind].includes(mimeType))
    return { error: `Unsupported file type for a ${kind}.`, status: 415 } as const;
  if (file.size > MAX_BYTES[kind]) return { error: `File is too large for a ${kind}.`, status: 413 } as const;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const issue = validateAssetContent(mimeType, bytes);
  if (issue) return { error: issue, status: 422 } as const;
  return { file: { bytes, mimeType, width, height, originalFilename: file.name.slice(0, 255) } } as const;
}
