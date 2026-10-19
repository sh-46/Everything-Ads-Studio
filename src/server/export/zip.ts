import { createReadStream, promises as fs } from "node:fs";
import { crc32 } from "node:zlib";
import { unzipSync, Zip, ZipPassThrough } from "fflate";

/**
 * ZIP packaging for exports. Files are stored, not recompressed (MP4/PNG already are).
 * Only imported by the (server-only) job runner; kept free of Next imports so it can be
 * unit-tested with real files.
 */

export interface ZipEntry {
  /** Path inside the ZIP, e.g. "Facebook_Build/01_Intro_1080x1920.mp4". */
  name: string;
  /** File on disk. */
  source: string;
}

/** Disambiguates duplicate names ("a.mp4", "a-2.mp4", …) so nothing is overwritten. */
export function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((original) => {
    let name = original;
    for (let n = 2; used.has(name); n++) name = original.replace(/(\.[a-z0-9]+)$/i, `-${n}$1`);
    used.add(name);
    return name;
  });
}

/**
 * Streams the files into `out`. Writes are strictly sequential: concurrent
 * `FileHandle.write` calls without a position are not ordered, which corrupted large
 * entries (bad CRC) in an earlier version.
 */
export async function writeZip(out: string, entries: ZipEntry[]): Promise<void> {
  const handle = await fs.open(out, "w");
  try {
    await new Promise<void>((resolve, reject) => {
      let chain: Promise<unknown> = Promise.resolve();
      const zip = new Zip((error, chunk, final) => {
        if (error) return reject(error);
        const copy = chunk.slice(); // fflate may hand back buffers it later reuses
        chain = chain.then(() => handle.write(copy));
        if (final) chain.then(() => resolve(), reject);
      });
      (async () => {
        for (const entry of entries) {
          const file = new ZipPassThrough(entry.name);
          zip.add(file);
          for await (const chunk of createReadStream(entry.source)) file.push(chunk as Uint8Array);
          file.push(new Uint8Array(0), true);
        }
        zip.end();
      })().catch(reject);
    });
  } finally {
    await handle.close();
  }
}

async function fileCrc(path: string): Promise<{ crc: number; size: number }> {
  let crc = 0;
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    crc = crc32(chunk as Buffer, crc);
    size += (chunk as Buffer).length;
  }
  return { crc, size };
}

/**
 * Re-reads the finished ZIP and checks every entry byte-for-byte (size + CRC-32) against
 * its source file, so a damaged package is never offered for download.
 */
export async function verifyZip(out: string, entries: ZipEntry[]): Promise<void> {
  const files = unzipSync(new Uint8Array(await fs.readFile(out)));
  for (const entry of entries) {
    const data = files[entry.name];
    if (!data) throw new Error(`ZIP is missing ${entry.name}.`);
    const expected = await fileCrc(entry.source);
    if (data.length !== expected.size || crc32(data) !== expected.crc) {
      throw new Error(`ZIP entry ${entry.name} doesn't match the rendered file.`);
    }
  }
  if (Object.keys(files).length !== entries.length) throw new Error("ZIP has unexpected entries.");
}
