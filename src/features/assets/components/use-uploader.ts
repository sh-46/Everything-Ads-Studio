"use client";

import { useCallback, useState } from "react";
import type { Asset, AssetKind, AssetMetadata } from "@/domain/asset";
import { prepareFile, uploadAsset, type UploadTarget } from "../upload";

export interface UploadItem {
  id: string;
  name: string;
  status: "uploading" | "error";
  error?: string;
}

/**
 * Uploads files one by one, tracking progress and failures. Failed files stay listed
 * with their error until dismissed; successful ones are returned to the caller.
 */
export function useUploader(target: UploadTarget) {
  const [items, setItems] = useState<UploadItem[]>([]);

  const upload = useCallback(
    async (
      files: File[],
      kind: AssetKind,
      extra?: (file: File) => { displayName?: string | null; metadata?: AssetMetadata },
    ): Promise<Asset[]> => {
      const uploaded: (Asset | null)[] = files.map(() => null);
      await Promise.all(
        files.map(async (file, index) => {
          const id = crypto.randomUUID();
          setItems((list) => [...list, { id, name: file.name, status: "uploading" }]);
          try {
            const prepared = await prepareFile(file, kind);
            const asset = await uploadAsset(kind, prepared, target, extra?.(file));
            uploaded[index] = asset;
            setItems((list) => list.filter((u) => u.id !== id));
          } catch (error) {
            const message = error instanceof Error ? error.message : "Upload failed";
            setItems((list) => list.map((u) => (u.id === id ? { ...u, status: "error", error: message } : u)));
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
