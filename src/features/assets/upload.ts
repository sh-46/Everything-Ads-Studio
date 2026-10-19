"use client";

import {
  assetStoragePath,
  MAX_BYTES,
  normalizeMime,
  svgIntrinsicSize,
  validateAssetContent,
  type Asset,
  type AssetKind,
  type AssetMetadata,
} from "@/domain/asset";
import { guessFromFilename, parseFontMetadata } from "@/domain/font-metadata";
import { createClient } from "@/lib/supabase/client";
import { registerAsset, replaceAssetFile } from "./actions";

/** Where uploads go. `demoMode` is decided on the server and passed down as a prop. */
export interface UploadTarget {
  workspaceId: string;
  brandId: string;
  /** Required for photos; null for Brand Kit logos and fonts. */
  projectId: string | null;
  demoMode: boolean;
}

export interface PreparedFile {
  file: File;
  mimeType: string;
  width: number | null;
  height: number | null;
  /** Font family/weight/style detected from the file (fonts only). */
  detected?: AssetMetadata;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function imageSize(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/** Validates type, size and content in the browser, and reads dimensions/font metadata. */
export async function prepareFile(file: File, kind: AssetKind): Promise<PreparedFile> {
  const mimeType = normalizeMime(kind, file);
  if (!mimeType) {
    throw new Error(
      kind === "photo"
        ? "Use JPG, PNG or WebP photos."
        : kind === "logo"
          ? "Use SVG, PNG or WebP logos."
          : "Use TTF, OTF, WOFF or WOFF2 fonts.",
    );
  }
  if (file.size > MAX_BYTES[kind]) throw new Error(`${file.name} is larger than ${MAX_BYTES[kind] / 1024 / 1024} MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const issue = validateAssetContent(mimeType, bytes);
  if (issue) throw new Error(issue);

  if (kind === "font") {
    const parsed = await parseFontMetadata(bytes, inflate).catch(() => null);
    return { file, mimeType, width: null, height: null, detected: parsed ?? guessFromFilename(file.name) };
  }
  if (mimeType === "image/svg+xml") {
    const size = svgIntrinsicSize(new TextDecoder().decode(bytes));
    return { file, mimeType, width: size?.width ?? null, height: size?.height ?? null };
  }
  const { width, height } = await imageSize(file);
  return { file, mimeType, width, height };
}

function demoForm(prepared: PreparedFile): FormData {
  const form = new FormData();
  form.set("file", prepared.file);
  form.set("mimeType", prepared.mimeType);
  form.set("width", prepared.width ? String(prepared.width) : "");
  form.set("height", prepared.height ? String(prepared.height) : "");
  return form;
}

async function demoRequest(url: string, method: "POST" | "PUT", form: FormData): Promise<Asset> {
  const response = await fetch(url, { method, body: form });
  const body = (await response.json().catch(() => ({ error: "Upload failed" }))) as Asset | { error: string };
  if (!response.ok || "error" in body) throw new Error("error" in body ? body.error : "Upload failed");
  return body;
}

async function uploadToStorage(target: UploadTarget, prepared: PreparedFile): Promise<string> {
  const scope = target.projectId ? { projectId: target.projectId } : "brand-kit";
  const path = assetStoragePath(target.workspaceId, target.brandId, scope, crypto.randomUUID(), prepared.mimeType);
  const { error } = await createClient()
    .storage.from("assets")
    .upload(path, prepared.file, { contentType: prepared.mimeType, upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return path;
}

export async function uploadAsset(
  kind: AssetKind,
  prepared: PreparedFile,
  target: UploadTarget,
  extra: { displayName?: string | null; metadata?: AssetMetadata } = {},
): Promise<Asset> {
  const metadata = extra.metadata ?? prepared.detected ?? {};
  if (target.demoMode) {
    const form = demoForm(prepared);
    form.set("kind", kind);
    form.set("brandId", target.brandId);
    form.set("projectId", kind === "photo" ? (target.projectId ?? "") : "");
    form.set("displayName", extra.displayName ?? "");
    form.set("metadata", JSON.stringify(metadata));
    return demoRequest("/api/demo/assets", "POST", form);
  }
  const storagePath = await uploadToStorage(target, prepared);
  const result = await registerAsset({
    kind,
    brandId: target.brandId,
    projectId: kind === "photo" ? target.projectId : null,
    storagePath,
    mimeType: prepared.mimeType,
    byteSize: prepared.file.size,
    width: prepared.width,
    height: prepared.height,
    originalFilename: prepared.file.name,
    displayName: extra.displayName ?? null,
    metadata,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** Replaces the file behind an existing asset (same id), e.g. a corrected logo. */
export async function replaceAsset(asset: Asset, prepared: PreparedFile, target: UploadTarget): Promise<Asset> {
  if (target.demoMode) return demoRequest(`/api/demo/assets/${asset.id}`, "PUT", demoForm(prepared));
  const storagePath = await uploadToStorage({ ...target, projectId: asset.projectId }, prepared);
  const result = await replaceAssetFile(asset.id, {
    storagePath,
    mimeType: prepared.mimeType,
    byteSize: prepared.file.size,
    width: prepared.width,
    height: prepared.height,
    originalFilename: prepared.file.name,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
