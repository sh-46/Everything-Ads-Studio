import { existsSync, readFileSync } from "node:fs";
import { inflateSync, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  assetStoragePath,
  documentUsesAsset,
  expectedStoragePrefix,
  fontMimeFromFilename,
  matchesMagicBytes,
  normalizeMime,
  registerAssetInputSchema,
  svgIntrinsicSize,
  svgSafetyIssue,
  validateAssetContent,
} from "./asset";
import { guessFromFilename, parseFontMetadata } from "./font-metadata";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (s: string) => new TextEncoder().encode(s);

describe("file type checks", () => {
  it("recognises magic bytes", () => {
    expect(matchesMagicBytes("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesMagicBytes("image/png", bytes(0x89, 0x50, 0x4e, 0x47))).toBe(true);
    expect(matchesMagicBytes("image/webp", ascii("RIFF....WEBP"))).toBe(true);
    expect(matchesMagicBytes("font/woff2", ascii("wOF2...."))).toBe(true);
    expect(matchesMagicBytes("font/ttf", bytes(0, 1, 0, 0))).toBe(true);
    expect(matchesMagicBytes("font/otf", ascii("OTTO"))).toBe(true);
    expect(matchesMagicBytes("image/png", bytes(0xff, 0xd8, 0xff))).toBe(false);
  });

  it("maps font files by extension and SVGs without a type", () => {
    expect(fontMimeFromFilename("Brand-Bold.WOFF2")).toBe("font/woff2");
    expect(fontMimeFromFilename("x.eot")).toBeNull();
    expect(normalizeMime("logo", { name: "mark.svg", type: "" })).toBe("image/svg+xml");
    expect(normalizeMime("photo", { name: "a.gif", type: "image/gif" })).toBeNull();
  });
});

describe("SVG safety", () => {
  const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><path d="M0 0h10"/></svg>';
  it("accepts plain vector logos", () => {
    expect(svgSafetyIssue(ok)).toBeNull();
    expect(validateAssetContent("image/svg+xml", ascii(ok))).toBeNull();
  });
  it.each([
    ["<svg><script>alert(1)</script></svg>", "script"],
    ['<svg onload="x()"></svg>', "event handler"],
    ['<svg><a href="javascript:x"/></svg>', "javascript"],
    ["<svg><foreignObject><div/></foreignObject></svg>", "foreignObject"],
    ['<svg><image href="https://evil.example/x.png"/></svg>', "external"],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>', "entities"],
  ])("rejects %s", (svg, reason) => {
    expect(svgSafetyIssue(svg)?.toLowerCase()).toContain(reason.toLowerCase());
  });
  it("reads intrinsic size from width/height or viewBox", () => {
    expect(svgIntrinsicSize('<svg width="300px" height="80">')).toEqual({ width: 300, height: 80 });
    expect(svgIntrinsicSize(ok)).toEqual({ width: 200, height: 50 });
  });
});

describe("register input", () => {
  const base = {
    brandId: "6f1c0a2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
    storagePath: "ws/brand/x.png",
    byteSize: 10,
    width: 10,
    height: 10,
    originalFilename: "x.png",
  };
  it("photos need a project, logos/fonts must not have one", () => {
    expect(
      registerAssetInputSchema.safeParse({ ...base, kind: "photo", projectId: null, mimeType: "image/png" }).success,
    ).toBe(false);
    expect(
      registerAssetInputSchema.safeParse({ ...base, kind: "logo", projectId: null, mimeType: "image/png" }).success,
    ).toBe(true);
    expect(
      registerAssetInputSchema.safeParse({ ...base, kind: "logo", projectId: base.brandId, mimeType: "image/png" })
        .success,
    ).toBe(false);
  });
  it("fonts need a family and a font type", () => {
    const font = { ...base, kind: "font", projectId: null, mimeType: "font/woff2", width: null, height: null };
    expect(registerAssetInputSchema.safeParse(font).success).toBe(false);
    expect(registerAssetInputSchema.safeParse({ ...font, metadata: { family: "Brand Sans" } }).success).toBe(true);
    expect(
      registerAssetInputSchema.safeParse({ ...font, mimeType: "image/png", metadata: { family: "X" } }).success,
    ).toBe(false);
  });
  it("storage paths keep photos in the project folder and kit files in brand-kit", () => {
    expect(assetStoragePath("w", "b", { projectId: "p" }, "id", "image/jpeg")).toBe("w/b/p/id.jpg");
    expect(assetStoragePath("w", "b", "brand-kit", "id", "font/woff2")).toBe("w/b/brand-kit/id.woff2");
    expect(expectedStoragePrefix("w", "b", null)).toBe("w/b/brand-kit/");
  });
});

describe("usage", () => {
  it("finds layers by asset id, and fonts by family", () => {
    const doc = {
      layers: [
        { type: "logo", assetId: "L" },
        { type: "text", fontFamily: "Brand Sans" },
      ],
    };
    expect(documentUsesAsset(doc, { id: "L", kind: "logo", metadata: {} })).toBe(true);
    expect(documentUsesAsset(doc, { id: "F", kind: "font", metadata: { family: "Brand Sans" } })).toBe(true);
    expect(documentUsesAsset(doc, { id: "P", kind: "photo", metadata: {} })).toBe(false);
  });
});

describe("font metadata", () => {
  it("guesses from file names", () => {
    expect(guessFromFilename("AcuraBespoke-BoldItalic.woff2")).toEqual({
      family: "Acura Bespoke",
      weight: 700,
      style: "italic",
    });
    expect(guessFromFilename("BrandSans_SemiBold.otf")).toMatchObject({ family: "Brand Sans", weight: 600 });
    expect(guessFromFilename("Display.ttf")).toEqual({ family: "Display", weight: 400, style: "normal" });
  });

  it("returns null for WOFF2 (needs Brotli) and junk", async () => {
    expect(await parseFontMetadata(ascii("wOF2xxxxxxxxxxxx"))).toBeNull();
    expect(await parseFontMetadata(ascii("not a font at all"))).toBeNull();
  });

  const arialBold = "/System/Library/Fonts/Supplemental/Arial Bold.ttf";
  const arialItalic = "/System/Library/Fonts/Supplemental/Arial Italic.ttf";
  it.skipIf(!existsSync(arialBold))("reads family/weight from a real TTF", async () => {
    const meta = await parseFontMetadata(new Uint8Array(readFileSync(arialBold)));
    expect(meta).toEqual({ family: "Arial", weight: 700, style: "normal" });
  });
  it.skipIf(!existsSync(arialItalic))("detects italic", async () => {
    const meta = await parseFontMetadata(new Uint8Array(readFileSync(arialItalic)));
    expect(meta?.style).toBe("italic");
  });

  it.skipIf(!existsSync(arialBold))("reads a WOFF (zlib-compressed tables)", async () => {
    const woff = toWoff(new Uint8Array(readFileSync(arialBold)));
    const meta = await parseFontMetadata(woff, async (d) => new Uint8Array(inflateSync(d)));
    expect(meta).toEqual({ family: "Arial", weight: 700, style: "normal" });
  });
});

/** Minimal SFNT → WOFF 1.0 wrapper for testing (compresses every table). */
function toWoff(sfnt: Uint8Array): Uint8Array {
  const view = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const numTables = view.getUint16(4);
  const tables = Array.from({ length: numTables }, (_, i) => {
    const r = 12 + i * 16;
    const offset = view.getUint32(r + 8);
    const length = view.getUint32(r + 12);
    const raw = sfnt.slice(offset, offset + length);
    const compressed = new Uint8Array(deflateSync(raw));
    return {
      tag: sfnt.slice(r, r + 4),
      raw,
      data: compressed.length < raw.length ? compressed : raw,
      checksum: view.getUint32(r + 4),
    };
  });
  const headerSize = 44 + numTables * 20;
  const total = headerSize + tables.reduce((sum, t) => sum + Math.ceil(t.data.length / 4) * 4, 0);
  const out = new Uint8Array(total);
  const o = new DataView(out.buffer);
  out.set(ascii("wOFF"), 0);
  o.setUint32(4, view.getUint32(0));
  o.setUint32(8, total);
  o.setUint16(12, numTables);
  let offset = headerSize;
  tables.forEach((t, i) => {
    const r = 44 + i * 20;
    out.set(t.tag, r);
    o.setUint32(r + 4, offset);
    o.setUint32(r + 8, t.data.length);
    o.setUint32(r + 12, t.raw.length);
    o.setUint32(r + 16, t.checksum);
    out.set(t.data, offset);
    offset += Math.ceil(t.data.length / 4) * 4;
  });
  return out;
}
