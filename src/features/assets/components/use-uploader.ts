"use client";

import { useCallback, useState } from "react";
import type { Asset, AssetKind, AssetMetadata } from "@/domain/asset";
import { prepareFile, uploadAsset, type PreparedFile, type UploadTarget } from "../upload";
import { askPhotoDisclosures } from "./photo-import";

export interface UploadItem {
  id: string;
  name: string;
  status: "uploading" | "error";
  error?: string;
}

const UPLOAD_ATTEMPTS = 3;

/** Network/storage hiccups are worth retrying; rejected files and permission errors aren't. */
function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/not allowed|permission|policy|row-level|belong|unsupported|too large|invalid|exceeded|mime/i.test(message)) {
    return false;
  }
  return /fetch|network|timeout|timed out|5\d\d|gateway|unavailable|connection|ECONN|aborted/i.test(message);
}

type Extra = (file: File) => { displayName?: string | null; metadata?: AssetMetadata };

/**
 * Uploads files one by one, tracking progress and failures. Failed files stay listed
 * with their error until dismissed; successful ones are returned to the caller. Photos
 * are validated first, then the user is asked about disclosures for the valid ones.
 */
export function useUploader(target: UploadTarget) {
  const [items, setItems] = useState<UploadItem[]>([]);

  const upload = useCallback(
    async (files: File[], kind: AssetKind, extra?: Extra): Promise<Asset[]> => {
      const ids = files.map(() => crypto.randomUUID());
      setItems((list) => [
        ...list,
        ...files.map((file, i) => ({ id: ids[i], name: file.name, status: "uploading" as const })),
      ]);
      const fail = (index: number, error: unknown) => {
        const message = error instanceof Error ? error.message : "Upload failed";
        setItems((list) => list.map((u) => (u.id === ids[index] ? { ...u, status: "error", error: message } : u)));
      };
      const done = (index: number) => setItems((list) => list.filter((u) => u.id !== ids[index]));

      // 1. Validate in the browser (type, size, content).
      const prepared = await Promise.all(
        files.map((file, index) =>
          prepareFile(file, kind).catch((error: unknown) => {
            fail(index, error);
            return null;
          }),
        ),
      );
      const valid = prepared.flatMap((p, index) => (p ? [{ p, index }] : []));

      // 2. Photos: ask for each valid photo's disclosure (cancel = upload none of them).
      let withMeta = extra;
      if (kind === "photo" && !extra && valid.length > 0) {
        const disclosures = await askPhotoDisclosures(valid.map((v) => v.p.file));
        if (!disclosures) {
          valid.forEach((v) => done(v.index));
          return [];
        }
        withMeta = (file) => ({ metadata: disclosures[valid.findIndex((v) => v.p.file === file)] ?? {} });
      }

      // 3. Upload.
      const uploaded: (Asset | null)[] = files.map(() => null);
      await Promise.all(
        valid.map(async ({ p, index }: { p: PreparedFile; index: number }) => {
          // Transient failures (network, storage hiccups) retry with backoff; the file was
          // already validated and its disclosure answered, so nothing is asked again.
          for (let attempt = 1; ; attempt++) {
            try {
              uploaded[index] = await uploadAsset(kind, p, target, withMeta?.(p.file));
              done(index);
              return;
            } catch (error) {
              if (attempt >= UPLOAD_ATTEMPTS || !isTransient(error)) {
                fail(index, error);
                return;
              }
              setItems((list) =>
                list.map((u) => (u.id === ids[index] ? { ...u, name: `${p.file.name} (retrying)` } : u)),
              );
              await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
            }
          }
        }),
      );
      // Successful uploads, in the order the user picked the files.
      return uploaded.filter((a): a is Asset => a !== null);
    },
    [target],
  );

  const dismiss = useCallback((id: string) => setItems((list) => list.filter((u) => u.id !== id)), []);

  return { items, upload, dismiss, busy: items.some((u) => u.status === "uploading") };
}
