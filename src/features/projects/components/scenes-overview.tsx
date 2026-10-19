"use client";

import { ImageOff, PenTool, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { assetLabel, documentUsesAsset, type Asset } from "@/domain/asset";
import type { Scene } from "@/domain/scene";
import { MAX_SCENE_PHOTOS, sceneAssetIds, type PhotoSlot } from "@/domain/scene-photos";
import { AssetPickerDialog, AssetThumb } from "@/features/assets/components/asset-picker-dialog";
import { DeleteAssetDialog } from "@/features/assets/components/delete-asset-dialog";
import { FileDropZone, UploadQueue } from "@/features/assets/components/upload-widgets";
import { useUploader } from "@/features/assets/components/use-uploader";
import type { UploadTarget } from "@/features/assets/upload";
import { assignScenePhoto } from "@/features/editor/actions";

interface PickerState {
  scene: Scene;
  slot: PhotoSlot;
  currentAssetId: string | null;
}

/**
 * Prepare photos before opening the editor: upload to the project library, then assign
 * them to each scene's photo slots. Assignments are saved to the scene immediately, so
 * the editor opens with them in place.
 */
export function ScenesOverview({
  projectId,
  scenes: initialScenes,
  photos: initialPhotos,
  target,
  demoMode,
}: {
  projectId: string;
  scenes: Scene[];
  photos: Asset[];
  target: UploadTarget;
  demoMode: boolean;
}) {
  const [scenes, setScenes] = useState(initialScenes);
  const [photos, setPhotos] = useState(initialPhotos);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [busyScene, setBusyScene] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const { items, upload, dismiss, busy } = useUploader(target);
  const photosById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const addPhotos = (uploaded: Asset[]) =>
    setPhotos((list) => [...uploaded, ...list.filter((p) => !uploaded.some((u) => u.id === p.id))]);

  const assign = async (scene: Scene, slot: PhotoSlot, assetId: string | null) => {
    setBusyScene(scene.id);
    setNotice(null);
    const result = await assignScenePhoto({ sceneId: scene.id, expectedRevision: scene.revision, slot, assetId });
    setBusyScene(null);
    if (result.status === "saved") {
      setScenes((list) => list.map((s) => (s.id === scene.id ? result.scene : s)));
    } else if (result.status === "conflict") {
      setScenes((list) => list.map((s) => (s.id === scene.id ? result.current : s)));
      setNotice({
        error: true,
        text: `“${scene.name}” was changed elsewhere (e.g. an open editor). Showing the latest version — try again.`,
      });
    } else {
      setNotice({ error: true, text: result.error });
    }
  };

  const usageCount = (asset: Asset) => scenes.filter((s) => documentUsesAsset(s.document, asset)).length;

  return (
    <div className="space-y-10">
      <section aria-labelledby="library-heading">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="library-heading" className="text-sm font-semibold">
            Project photos <span className="text-muted-foreground font-normal tabular-nums">{photos.length}</span>
          </h2>
          {demoMode && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Demo Mode: photos are kept in memory until the dev server restarts.
            </p>
          )}
        </div>
        <FileDropZone
          kind="photo"
          label="Upload photos"
          hint="JPG, PNG or WebP · select several at once or drag them here"
          onFiles={(files) => void upload(files, "photo").then(addPhotos)}
          disabled={busy}
          testId="overview-upload-input"
        />
        <div className="mt-2">
          <UploadQueue items={items} onDismiss={dismiss} />
        </div>
        {photos.length > 0 && (
          <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8" aria-label="Project photo library">
            {photos.map((photo) => {
              const used = usageCount(photo);
              return (
                <li key={photo.id} className="group relative">
                  <div className="border-border bg-muted aspect-square overflow-hidden rounded-md border">
                    <AssetThumb asset={photo} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleting(photo)}
                    aria-label={`Delete ${assetLabel(photo)}`}
                    title="Delete file permanently"
                    className="bg-background/90 absolute top-1 right-1 rounded p-0.5 opacity-0 shadow-sm group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                  <p className="text-muted-foreground mt-1 truncate text-[10px]" title={assetLabel(photo)}>
                    {used > 0 ? `In ${used} ${used === 1 ? "scene" : "scenes"}` : "Unassigned"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="scenes-heading">
        <h2 id="scenes-heading" className="mb-3 text-sm font-semibold">
          Scenes
        </h2>
        {notice && (
          <p role="alert" className={cn("mb-3 text-sm", notice.error ? "text-destructive" : "text-muted-foreground")}>
            {notice.text}
          </p>
        )}
        <ol className="grid gap-3 sm:grid-cols-2" aria-label="Scene cards">
          {scenes.map((scene, index) => {
            const ids = sceneAssetIds(scene.document);
            const graphicOnly = scene.kind === "cta";
            return (
              <li
                key={scene.id}
                className={cn("border-border rounded-xl border p-4", busyScene === scene.id && "opacity-60")}
                data-testid={`scene-card-${scene.kind}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      <span className="text-muted-foreground tabular-nums">{index + 1}.</span> {scene.name}
                    </p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {scene.document.width}×{scene.document.height} · {(scene.document.durationMs / 1000).toFixed(1)}s
                    </p>
                  </div>
                  <Button variant="outline" size="xs" asChild>
                    <Link href={`/projects/${projectId}/editor?scene=${scene.id}`}>
                      <PenTool /> Open editor
                    </Link>
                  </Button>
                </div>

                {graphicOnly && (
                  <p className="text-muted-foreground mt-2 text-xs">Graphic-only scene — a photo is optional.</p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3">
                  {([1, 2] as const).slice(0, MAX_SCENE_PHOTOS).map((slot) => {
                    const assetId = ids[slot - 1];
                    const asset = assetId ? photosById.get(assetId) : undefined;
                    return (
                      <div key={slot} className="space-y-1.5">
                        <p className="text-muted-foreground text-[11px]">
                          Photo {slot}
                          {slot === 2 && " (optional)"}
                        </p>
                        <div className="border-border bg-muted relative aspect-[4/3] overflow-hidden rounded-md border">
                          {asset ? (
                            <AssetThumb asset={asset} />
                          ) : (
                            <div className="text-muted-foreground flex h-full items-center justify-center text-[11px]">
                              {assetId ? (
                                <span className="flex items-center gap-1">
                                  <ImageOff className="size-3.5" /> Unavailable
                                </span>
                              ) : (
                                "Empty"
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="xs"
                            className="flex-1"
                            disabled={busyScene !== null}
                            onClick={() => setPicker({ scene, slot, currentAssetId: assetId })}
                            data-testid={`assign-${scene.kind}-${slot}`}
                          >
                            {assetId ? "Replace…" : "Upload / choose…"}
                          </Button>
                          {assetId && (
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={busyScene !== null}
                              onClick={() => void assign(scene, slot, null)}
                              title="Unassign from this scene (the file stays in the library)"
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <AssetPickerDialog
        open={picker !== null}
        onOpenChange={(open) => !open && setPicker(null)}
        kind="photo"
        title={
          picker
            ? `${picker.currentAssetId ? "Replace" : "Assign"} photo ${picker.slot} — ${picker.scene.name}`
            : "Choose photo"
        }
        description={
          picker?.currentAssetId
            ? "This replaces the photo in the existing frame. Its position, crop and motion are kept; nothing else in the scene changes."
            : "Upload from your computer or choose a photo already in this project."
        }
        assets={photos}
        target={target}
        currentAssetId={picker?.currentAssetId}
        onUploaded={addPhotos}
        onPick={(asset) => picker && void assign(picker.scene, picker.slot, asset.id)}
        pickLabel={picker?.currentAssetId ? "Replace photo" : "Assign photo"}
      />
      <DeleteAssetDialog
        asset={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={(id) => setPhotos((list) => list.filter((p) => p.id !== id))}
      />
    </div>
  );
}
