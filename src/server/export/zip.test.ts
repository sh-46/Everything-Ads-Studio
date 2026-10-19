import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uniqueNames, verifyZip, writeZip, type ZipEntry } from "./zip";

let dir: string;
let entries: ZipEntry[];

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "zip-test-"));
  // Sizes like a real package: several multi-MB MP4s and a small PNG.
  const sizes = [9_500_000, 6_200_000, 11_396, 5_600_000, 4_100_000];
  entries = await Promise.all(
    sizes.map(async (size, i) => {
      const source = path.join(dir, `f${i}.bin`);
      await fs.writeFile(source, randomBytes(size));
      return { name: `Folder/${i}.mp4`, source };
    }),
  );
});

afterAll(() => fs.rm(dir, { recursive: true, force: true }));

describe("export ZIP", () => {
  it("stores every file byte-for-byte (large files included) and verifies", async () => {
    const out = path.join(dir, "package.zip");
    await writeZip(out, entries);
    await expect(verifyZip(out, entries)).resolves.toBeUndefined();
    const files = unzipSync(new Uint8Array(await fs.readFile(out)));
    for (const entry of entries) {
      expect(Buffer.from(files[entry.name]).equals(await fs.readFile(entry.source))).toBe(true);
    }
  });

  it("detects a damaged package", async () => {
    const out = path.join(dir, "damaged.zip");
    await writeZip(out, entries);
    const bytes = await fs.readFile(out);
    bytes[200_000] ^= 0xff; // inside the first entry's data
    await fs.writeFile(out, bytes);
    await expect(verifyZip(out, entries)).rejects.toThrow(/doesn't match/);
  });

  it("never overwrites: duplicate names get a suffix", () => {
    expect(uniqueNames(["a/x.mp4", "a/x.mp4", "a/y.png", "a/x.mp4"])).toEqual([
      "a/x.mp4",
      "a/x-2.mp4",
      "a/y.png",
      "a/x-3.mp4",
    ]);
  });
});
