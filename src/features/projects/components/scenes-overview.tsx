"use client";

import { ImageOff, PenTool, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { assetLabel, documentUsesAsset, type Asset, type PhotoDisclosure } from "@/domain/asset";
import {
  disclosureLayersFor,
  planPhotoChange,
  type DisclosureDecision,
  type PhotoChangePlan,
} from "@/domain/disclosures";
import type { Scene } from "@/domain/scene";
import { MAX_SCENE_PHOTOS, sceneAssetIds, scenePhotoLayers, type PhotoSlot } from "@/domain/scene-photos";
import { DisclosurePromptDialog } from "@/features/assets/components/disclosure-prompt-dialog";
import { PhotoDisclosureDialog } from "@/features/assets/components/photo-disclosure-dialog";
import { AssetPickerDialog, AssetThumb } from "@/features/assets/components/asset-picker-dialog";
import { DeleteAssetDialog } from "@/features/assets/components/delete-asset-dialog";
import { FileDropZone, UploadQueue } from "@/features/assets/components/upload-widgets";
import { useUploader } from "@/features/assets/components/use-uploader";
import type { UploadTarget } from "@/features/assets/upload";
import { assignScenePhoto, syncPhotoDisclosure } from "@/features/editor/actions";

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
  const [editingDisclosure, setEditingDisclosure] = useState<Asset | null>(null);
  const [pendingAssign, setPendingAssign] = useState<{
    scene: Scene;
    slot: PhotoSlot;
    assetId: string | null;
    prompt: PhotoChangePlan["prompt"];
  } | null>(null);
  const { items, upload, dismiss, busy } = useUploader(target);
  const photosById = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  const addPhotos = (uploaded: Asset[]) =>
    setPhotos((list) => [...uploaded, ...list.filter((p) => !uploaded.some((u) => u.id === p.id))]);

  /** Asks about the frame's disclosure first when the change affects it. */
  const assign = (scene: Scene, slot: PhotoSlot, assetId: string | null, known: Asset[] = []) => {
    const all = new Map([...photos, ...known].map((p) => [p.id, p]));
    const frame = scenePhotoLayers(scene.document)[slot === 1 ? "slot1" : "slot2"];
    const plan = planPhotoChange(scene.document, frame?.id ?? null, assetId ? (all.get(assetId) ?? null) : null, all);
    if (plan.prompt) setPendingAssign({ scene, slot, assetId, prompt: plan.prompt });
    else void commitAssign(scene, slot, assetId, "apply");
  };

  const commitAssign = async (
    scene: Scene,
    slot: PhotoSlot,
    assetId: string | null,
    disclosure: DisclosureDecision,
  ) => {
    setBusyScene(scene.id);
    setNotice(null);
    const result = await assignScenePhoto({
      sceneId: scene.id,
      expectedRevision: scene.revision,
      slot,
      assetId,
      disclosure,
    });
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

  /** What saving a photo's disclosure will change in the scenes. */
  const disclosureImpact = (asset: Asset) => (next: PhotoDisclosure) => {
    let frames = 0;
    let layers = 0;
    for (const scene of scenes) {
      for (const l of scene.document.layers) {
        if (l.type !== "image" || l.assetId !== asset.id) continue;
        frames++;
        layers += disclosureLayersFor(scene.document, l.id).length;
      }
    }
    if (frames === 0) return null;
    if (next.requiresDisclosure && frames > layers)
      return `Adds a disclosure layer to the ${frames - layers} ${frames - layers === 1 ? "scene" : "scenes"} using this photo without one.`;
    if (!next.requiresDisclosure && layers > 0)
      return `Removes this photo’s disclosure layer from ${layers} ${layers === 1 ? "scene" : "scenes"}.`;
    return next.requiresDisclosure ? `Updates the wording in ${layers} ${layers === 1 ? "scene" : "scenes"}.` : null;
  };

  const afterDisclosureSaved = async (saved: Asset) => {
    setPhotos((list) => list.map((p) => (p.id === saved.id ? saved : p)));
    const result = await syncPhotoDisclosure(projectId, saved.id);
    if (!result.ok) {
      setNotice({ error: true, text: result.error });
      return;
    }
    setScenes((list) => list.map((s) => result.scenes.find((u) => u.id === s.id) ?? s));
    const parts = [
      result.added && `added to ${result.added} ${result.added === 1 ? "scene" : "scenes"}`,
      result.removed && `removed from ${result.removed} ${result.removed === 1 ? "scene" : "scenes"}`,
    ].filter(Boolean);
    setNotice({
      error: result.conflicts.length > 0,
      text:
        `Disclosure saved${parts.length ? ` — layer ${parts.join(", ")}` : ""}.` +
        (result.conflicts.length
          ? ` ${result.conflicts.join(", ")} changed elsewhere and wasn’t updated; open it in the editor to review.`
          : ""),
    });
  };

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
                    onClick={() => setEditingDisclosure(photo)}
                    className={
                      photo.metadata.requiresDisclosure
                        ? "absolute bottom-6 left-1 flex items-center gap-0.5 rounded bg-amber-400 px-1 text-[9px] font-semibold text-amber-950"
                        : "bg-background/90 absolute bottom-6 left-1 flex items-center gap-0.5 rounded px-1 text-[9px] opacity-0 shadow-sm group-hover:opacity-100 focus-visible:opacity-100"
                    }
                    title={
                      photo.metadata.requiresDisclosure
                        ? `Disclosure: ${photo.metadata.disclosureText ?? "(no wording yet)"}`
                        : "Set a disclosure for this photo"
                    }
                    aria-label={`Disclosure for ${assetLabel(photo)}`}
                    data-testid="library-disclosure"
                    data-requires={photo.metadata.requiresDisclosure ? "true" : "false"}
                  >
                    <ShieldCheck className="size-2.5" aria-hidden />
                    {photo.metadata.requiresDisclosure ? "Disclosure" : "Disclosure…"}
                  </button>
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
                              onClick={() => assign(scene, slot, null)}
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
        onPick={(asset) => picker && assign(picker.scene, picker.slot, asset.id, [asset])}
        pickLabel={picker?.currentAssetId ? "Replace photo" : "Assign photo"}
      />
      <PhotoDisclosureDialog
        asset={editingDisclosure}
        onOpenChange={(open) => !open && setEditingDisclosure(null)}
        impact={editingDisclosure ? disclosureImpact(editingDisclosure) : undefined}
        onSaved={afterDisclosureSaved}
      />
      <DisclosurePromptDialog
        prompt={pendingAssign?.prompt}
        onResolve={(decision) => {
          const pending = pendingAssign;
          setPendingAssign(null);
          if (pending && decision) void commitAssign(pending.scene, pending.slot, pending.assetId, decision);
        }}
      />
      <DeleteAssetDialog
        asset={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={(id) => setPhotos((list) => list.filter((p) => p.id !== id))}
      />
    </div>
  );
}
