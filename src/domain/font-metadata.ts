/**
 * Best-effort font identification for uploads. Reads the `name` and `OS/2` tables of
 * TTF/OTF and WOFF files; WOFF2 (Brotli-compressed) falls back to the file name.
 * Users can always correct the result in the Brand Kit.
 */

export interface FontMetadata {
  family: string;
  weight: number;
  style: "normal" | "italic";
}

const WEIGHT_WORDS: [RegExp, number][] = [
  [/hairline|thin/i, 100],
  [/extra\s*light|ultra\s*light/i, 200],
  [/semi\s*bold|demi\s*bold/i, 600],
  [/extra\s*bold|ultra\s*bold/i, 800],
  [/black|heavy/i, 900],
  [/light/i, 300],
  [/medium/i, 500],
  [/bold/i, 700],
  [/regular|book|normal|roman/i, 400],
];

export function weightFromName(name: string): number | null {
  for (const [pattern, weight] of WEIGHT_WORDS) if (pattern.test(name)) return weight;
  return null;
}

/** "AcuraBespoke-BoldItalic.woff2" → { family: "Acura Bespoke", weight: 700, style: "italic" } */
export function guessFromFilename(filename: string): FontMetadata {
  const base = filename.replace(/\.[^.]+$/, "");
  const [familyPart, ...rest] = base.split(/[-_]/);
  const stylePart = rest.join(" ");
  const family =
    familyPart
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim() || "Uploaded Font";
  const descriptor = stylePart || base;
  return {
    family,
    weight: weightFromName(descriptor) ?? 400,
    style: /italic|oblique/i.test(descriptor) ? "italic" : "normal",
  };
}

interface TableRecord {
  offset: number;
  length: number;
  compLength?: number;
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function decodeName(bytes: Uint8Array, platformId: number): string {
  if (platformId === 0 || platformId === 3) {
    let out = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return out;
  }
  return String.fromCharCode(...bytes);
}

function parseNameTable(table: Uint8Array): Map<number, string> {
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const count = view.getUint16(2);
  const stringOffset = view.getUint16(4);
  const names = new Map<number, { value: string; score: number }>();
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    if (r + 12 > table.length) break;
    const platformId = view.getUint16(r);
    const languageId = view.getUint16(r + 4);
    const nameId = view.getUint16(r + 6);
    const length = view.getUint16(r + 8);
    const offset = view.getUint16(r + 10);
    const start = stringOffset + offset;
    if (start + length > table.length) continue;
    // Prefer Windows US-English, then any Windows/Unicode, then Mac.
    const score = platformId === 3 && languageId === 0x409 ? 3 : platformId === 3 || platformId === 0 ? 2 : 1;
    const current = names.get(nameId);
    if (!current || score > current.score) {
      names.set(nameId, { value: decodeName(table.slice(start, start + length), platformId).trim(), score });
    }
  }
  return new Map([...names].map(([id, v]) => [id, v.value]));
}

export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

/** Returns parsed metadata, or null if the file can't be read (e.g. WOFF2). */
export async function parseFontMetadata(bytes: Uint8Array, inflate?: Inflate): Promise<FontMetadata | null> {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = readTag(view, 0);
  const tables = new Map<string, TableRecord>();

  if (signature === "wOFF") {
    const numTables = view.getUint16(12);
    for (let i = 0; i < numTables; i++) {
      const r = 44 + i * 20;
      if (r + 20 > bytes.length) return null;
      tables.set(readTag(view, r), {
        offset: view.getUint32(r + 4),
        compLength: view.getUint32(r + 8),
        length: view.getUint32(r + 12),
      });
    }
  } else if (signature === "OTTO" || signature === "true" || view.getUint32(0) === 0x00010000) {
    const numTables = view.getUint16(4);
    for (let i = 0; i < numTables; i++) {
      const r = 12 + i * 16;
      if (r + 16 > bytes.length) return null;
      tables.set(readTag(view, r), { offset: view.getUint32(r + 8), length: view.getUint32(r + 12) });
    }
  } else {
    return null;
  }

  const read = async (tag: string): Promise<Uint8Array | null> => {
    const t = tables.get(tag);
    if (!t) return null;
    const size = t.compLength ?? t.length;
    if (t.offset + size > bytes.length) return null;
    const raw = bytes.slice(t.offset, t.offset + size);
    if (t.compLength !== undefined && t.compLength < t.length) return inflate ? inflate(raw) : null;
    return raw;
  };

  const nameTable = await read("name");
  if (!nameTable) return null;
  const names = parseNameTable(nameTable);
  const family = names.get(16) || names.get(1);
  if (!family) return null;
  const subfamily = names.get(17) || names.get(2) || "";

  let weight = weightFromName(subfamily) ?? 400;
  let italic = /italic|oblique/i.test(subfamily);
  const os2 = await read("OS/2");
  if (os2 && os2.length >= 64) {
    const os2View = new DataView(os2.buffer, os2.byteOffset, os2.byteLength);
    const weightClass = os2View.getUint16(4);
    if (weightClass >= 100 && weightClass <= 900) weight = Math.round(weightClass / 100) * 100;
    italic = italic || (os2View.getUint16(62) & 1) === 1;
  }
  return { family, weight, style: italic ? "italic" : "normal" };
}
