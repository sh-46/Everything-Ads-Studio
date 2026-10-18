"use client";

import { AlertCircle, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES, photoStoragePath, type Asset } from "@/domain/asset";
import { makeLayer, type ImageLayer } from "@/domain/scene";
import { createClient } from "@/lib/supabase/client";
import { registerPhoto } from "@/features/assets/actions";
import { useActiveScene, useEditorStore, useSelectedLayer } from "../store/editor-store";

type PhotoMime = (typeof PHOTO_MIME_TYPES)[number];

interface UploadItem {
  id: string;
  name: string;
  status: "uploading" | "error";
  error?: string;
}

async function readDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

export function AssetLibrary({ workspaceId }: { workspaceId: string }) {
  const assets = useEditorStore((s) => s.assets);
  const projectId = useEditorStore((s) => s.projectId);
  const brandId = useEditorStore((s) => s.brandId);
  const addAsset = useEditorStore((s) => s.addAsset);
  const addLayer = useEditorStore((s) => s.addLayer);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const scene = useActiveScene();
  const selected = useSelectedLayer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);

  const setUpload = (id: string, patch: Partial<UploadItem> | null) =>
    setUploads((list) =>
      patch ? list.map((u) => (u.id === id ? { ...u, ...patch } : u)) : list.filter((u) => u.id !== id),
    );

  const uploadFile = async (file: File) => {
    const id = crypto.randomUUID();
    setUploads((list) => [...list, { id, name: file.name, status: "uploading" }]);
    try {
      if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
        throw new Error("Use JPG, PNG or WebP photos.");
      }
      if (file.size > MAX_PHOTO_BYTES) throw new Error("Photos must be 25 MB or smaller.");
      const mimeType = file.type as PhotoMime;
      const { width, height } = await readDimensions(file);
      const path = photoStoragePath(workspaceId, brandId, projectId, id, mimeType);

      const { error: uploadError } = await createClient()
        .storage.from("assets")
        .upload(path, file, { contentType: mimeType, upsert: false, cacheControl: "31536000" });
      if (uploadError) throw new Error(uploadError.message);

      const result = await registerPhoto({
        projectId,
        storagePath: path,
        mimeType,
        byteSize: file.size,
        width,
        height,
        originalFilename: file.name,
      });
      if (!result.ok) throw new Error(result.error);
      addAsset(result.data);
      setUpload(id, null);
    } catch (error) {
      setUpload(id, { status: "error", error: error instanceof Error ? error.message : "Upload failed" });
    }
  };

  const placeAsset = (asset: Asset) => {
    if (selected?.type === "image") {
      updateLayer(selected.id, { assetId: asset.id });
      return;
    }
    if (!scene) return;
    const { width, height } = scene.document;
    addLayer(
      makeLayer<ImageLayer>({
        type: "image",
        name: asset.originalFilename.replace(/\.[^.]+$/, "").slice(0, 80) || "Photo",
        assetId: asset.id,
        fit: "cover",
        focalX: 0.5,
        focalY: 0.5,
        zoom: 1,
        x: 0,
        y: 0,
        width,
        height,
      }),
    );
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_MIME_TYPES.join(",")}
        multiple
        className="sr-only"
        aria-label="Upload photos"
        data-testid="photo-upload-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          files.forEach((f) => void uploadFile(f));
        }}
      />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload /> Upload photos
      </Button>
      <p className="text-muted-foreground px-0.5 text-[11px] leading-relaxed">
        {selected?.type === "image"
          ? "Click a photo to place it in the selected image layer."
          : "Click a photo to add it as a full-scene image layer."}
      </p>

      {uploads.map((u) => (
        <div
          key={u.id}
          className={cn(
            "flex items-start gap-2 rounded-md border px-2 py-1.5 text-[11px]",
            u.status === "error" ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground",
          )}
        >
          {u.status === "uploading" ? (
            <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" />
          ) : (
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{u.name}</span>
            {u.error && <span className="block">{u.error}</span>}
          </span>
          {u.status === "error" && (
            <button type="button" className="underline" onClick={() => setUpload(u.id, null)}>
              Dismiss
            </button>
          )}
        </div>
      ))}

      {assets.length === 0 && uploads.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
          No photos for this brand yet.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5" aria-label="Brand photos">
          {assets.map((asset) => {
            const inUse = selected?.type === "image" && selected.assetId === asset.id;
            return (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => placeAsset(asset)}
                  title={`${asset.originalFilename}${asset.width ? ` · ${asset.width}×${asset.height}` : ""}`}
                  className={cn(
                    "bg-muted hover:ring-ring/40 block aspect-square w-full overflow-hidden rounded-md border transition-shadow hover:ring-2",
                    inUse ? "border-primary ring-primary/50 ring-2" : "border-border",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- private signed URL */}
                  <img
                    src={asset.url}
                    alt={asset.originalFilename}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
