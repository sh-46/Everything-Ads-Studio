import { z } from "zod";

/**
 * Uploaded files. Photos belong to a model project; logos and fonts belong to a brand
 * (its Brand Kit) and are reusable across that brand's projects only.
 */

export const ASSET_KINDS = ["photo", "logo", "font"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const LOGO_MIME_TYPES = ["image/svg+xml", "image/png", "image/webp"] as const;
export const FONT_MIME_TYPES = ["font/ttf", "font/otf", "font/woff", "font/woff2"] as const;

export const MAX_BYTES: Record<AssetKind, number> = {
  photo: 25 * 1024 * 1024,
  logo: 5 * 1024 * 1024,
  font: 10 * 1024 * 1024,
};
export const MAX_PHOTO_BYTES = MAX_BYTES.photo;

export const ALLOWED_MIME: Record<AssetKind, readonly string[]> = {
  photo: PHOTO_MIME_TYPES,
  logo: LOGO_MIME_TYPES,
  font: FONT_MIME_TYPES,
};

/** `accept` attribute values for file inputs. Fonts are matched by extension. */
export const ACCEPT: Record<AssetKind, string> = {
  photo: PHOTO_MIME_TYPES.join(","),
  logo: [...LOGO_MIME_TYPES, ".svg"].join(","),
  font: ".ttf,.otf,.woff,.woff2",
};

export const LOGO_VARIANTS = ["Primary", "White", "Black", "Horizontal", "Stacked", "Icon", "Other"] as const;

export const fontStyleSchema = z.enum(["normal", "italic"]);

export const assetMetadataSchema = z
  .object({
    /** Logos */
    variant: z.string().max(40).optional(),
    /** Fonts */
    family: z.string().min(1).max(80).optional(),
    weight: z.number().int().min(100).max(900).optional(),
    style: fontStyleSchema.optional(),
  })
  .default({});

export type AssetMetadata = z.infer<typeof assetMetadataSchema>;

export const assetSchema = z.object({
  id: z.uuid(),
  kind: z.enum(ASSET_KINDS),
  /** Short-lived signed URL (or a local URL in Demo Mode); never persisted. */
  url: z.string(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  originalFilename: z.string(),
  mimeType: z.string(),
  projectId: z.uuid().nullable(),
  createdAt: z.string(),
  displayName: z.string().nullable().default(null),
  metadata: assetMetadataSchema,
});

export type Asset = z.infer<typeof assetSchema>;

/** A brand font as the renderers need it. */
export interface BrandFont {
  assetId: string;
  family: string;
  weight: number;
  style: "normal" | "italic";
  url: string;
}

export function brandFontsFromAssets(assets: Asset[]): BrandFont[] {
  return assets
    .filter((a) => a.kind === "font" && a.metadata.family)
    .map((a) => ({
      assetId: a.id,
      family: a.metadata.family!,
      weight: a.metadata.weight ?? 400,
      style: a.metadata.style ?? "normal",
      url: a.url,
    }));
}

export function assetLabel(asset: Asset): string {
  return asset.displayName || asset.metadata.family || asset.originalFilename;
}

export const registerAssetInputSchema = z
  .object({
    kind: z.enum(ASSET_KINDS),
    brandId: z.uuid(),
    /** Required for photos; must be null for logos and fonts. */
    projectId: z.uuid().nullable(),
    storagePath: z.string().min(1).max(500),
    mimeType: z.string().min(1).max(100),
    byteSize: z.number().int().positive(),
    width: z.number().int().positive().max(20_000).nullable(),
    height: z.number().int().positive().max(20_000).nullable(),
    originalFilename: z.string().min(1).max(255),
    displayName: z.string().trim().min(1).max(80).nullable().default(null),
    metadata: assetMetadataSchema,
  })
  .superRefine((v, ctx) => {
    if (!ALLOWED_MIME[v.kind].includes(v.mimeType)) {
      ctx.addIssue({ code: "custom", path: ["mimeType"], message: `Unsupported file type for a ${v.kind}.` });
    }
    if (v.byteSize > MAX_BYTES[v.kind]) {
      ctx.addIssue({ code: "custom", path: ["byteSize"], message: `File is too large for a ${v.kind}.` });
    }
    if ((v.kind === "photo") !== (v.projectId !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["projectId"],
        message: "Photos belong to projects; logos and fonts to brands.",
      });
    }
    if (v.kind === "font" && !v.metadata.family) {
      ctx.addIssue({ code: "custom", path: ["metadata", "family"], message: "Font family is required." });
    }
  });

export type RegisterAssetInput = z.input<typeof registerAssetInputSchema>;

export const assetMetaUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(80).nullable().optional(),
  metadata: assetMetadataSchema.optional(),
});
export type AssetMetaUpdate = z.infer<typeof assetMetaUpdateSchema>;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "font/woff": "woff",
  "font/woff2": "woff2",
};

/**
 * Storage layout (first segment drives storage RLS):
 *   photos:        {workspace}/{brand}/{project}/{uuid}.{ext}
 *   logos & fonts: {workspace}/{brand}/brand-kit/{uuid}.{ext}
 */
export function assetStoragePath(
  workspaceId: string,
  brandId: string,
  scope: { projectId: string } | "brand-kit",
  fileId: string,
  mimeType: string,
): string {
  const folder = scope === "brand-kit" ? "brand-kit" : scope.projectId;
  return `${workspaceId}/${brandId}/${folder}/${fileId}.${EXTENSIONS[mimeType] ?? "bin"}`;
}

/** Expected folder prefix for an asset, used to validate client-provided paths. */
export function expectedStoragePrefix(workspaceId: string, brandId: string, projectId: string | null): string {
  return `${workspaceId}/${brandId}/${projectId ?? "brand-kit"}/`;
}

/** Browsers report font MIME types inconsistently; trust the extension, verify the bytes. */
export function fontMimeFromFilename(filename: string): (typeof FONT_MIME_TYPES)[number] | null {
  const ext = filename.toLowerCase().split(".").pop();
  return ext === "ttf"
    ? "font/ttf"
    : ext === "otf"
      ? "font/otf"
      : ext === "woff"
        ? "font/woff"
        : ext === "woff2"
          ? "font/woff2"
          : null;
}

export function normalizeMime(kind: AssetKind, file: { name: string; type: string }): string | null {
  if (kind === "font") return fontMimeFromFilename(file.name);
  if (kind === "logo" && !file.type && file.name.toLowerCase().endsWith(".svg")) return "image/svg+xml";
  return ALLOWED_MIME[kind].includes(file.type) ? file.type : null;
}

/** Checks the leading bytes match the declared type, so a renamed file is rejected. */
export function matchesMagicBytes(mimeType: string, head: Uint8Array): boolean {
  const ascii = (start: number, length: number) => String.fromCharCode(...head.slice(start, start + length));
  switch (mimeType) {
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return head[0] === 0x89 && ascii(1, 3) === "PNG";
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
    case "font/ttf":
      return (head[0] === 0 && head[1] === 1 && head[2] === 0 && head[3] === 0) || ascii(0, 4) === "true";
    case "font/otf":
      return ascii(0, 4) === "OTTO" || (head[0] === 0 && head[1] === 1 && head[2] === 0 && head[3] === 0);
    case "font/woff":
      return ascii(0, 4) === "wOFF";
    case "font/woff2":
      return ascii(0, 4) === "wOF2";
    case "image/svg+xml":
      return /<svg[\s>]/i.test(new TextDecoder().decode(head));
    default:
      return false;
  }
}

/**
 * SVG logos are only ever drawn as images (where scripts never run), but we still refuse
 * active content so a stored file is safe if someone opens it directly.
 */
export function svgSafetyIssue(svgText: string): string | null {
  if (!/<svg[\s>]/i.test(svgText)) return "Not an SVG file.";
  if (/<script[\s>]/i.test(svgText)) return "SVG contains a script.";
  if (/<foreignObject[\s>]/i.test(svgText)) return "SVG contains embedded HTML (foreignObject).";
  if (/\son[a-z]+\s*=/i.test(svgText)) return "SVG contains event handler attributes.";
  if (/javascript:/i.test(svgText)) return "SVG contains a javascript: URL.";
  if (/<!ENTITY/i.test(svgText)) return "SVG declares entities.";
  if (/(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//i.test(svgText)) return "SVG references external files.";
  return null;
}

/** Intrinsic size of an SVG from width/height or viewBox, for aspect-correct placement. */
export function svgIntrinsicSize(svgText: string): { width: number; height: number } | null {
  const tag = /<svg\b[^>]*>/i.exec(svgText)?.[0];
  if (!tag) return null;
  const num = (name: string) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, "i").exec(tag);
    return m ? Number(m[1]) : null;
  };
  const width = num("width");
  const height = num("height");
  if (width && height) return { width: Math.round(width), height: Math.round(height) };
  const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(tag);
  if (viewBox) return { width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) };
  return null;
}

/** A scene that references an asset (by id, or by font family for fonts). */
export interface AssetUsage {
  projectId: string;
  projectName: string;
  sceneId: string;
  sceneName: string;
}

/** Usage check over in-memory documents; mirrors the SQL `asset_usage` function. */
export function documentUsesAsset(
  doc: { layers: { type: string; assetId?: string | null; fontFamily?: string }[] },
  asset: Pick<Asset, "id" | "kind" | "metadata">,
): boolean {
  return doc.layers.some(
    (l) =>
      ("assetId" in l && l.assetId === asset.id) ||
      (asset.kind === "font" && l.type === "text" && l.fontFamily === asset.metadata.family),
  );
}

/** Server/client content check for an uploaded file. Returns a user-facing error or null. */
export function validateAssetContent(mimeType: string, bytes: Uint8Array): string | null {
  if (!matchesMagicBytes(mimeType, bytes.slice(0, 512))) {
    return "The file contents don't match its type. Re-export the file and try again.";
  }
  if (mimeType === "image/svg+xml") return svgSafetyIssue(new TextDecoder().decode(bytes));
  return null;
}
