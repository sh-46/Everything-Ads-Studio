"use client";

import { ImagePlus, MoreHorizontal, Replace, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assetLabel, type Asset } from "@/domain/asset";
import { AssetThumb } from "@/features/assets/components/asset-picker-dialog";
import { DeleteAssetDialog } from "@/features/assets/components/delete-asset-dialog";
import { FileDropZone, UploadQueue } from "@/features/assets/components/upload-widgets";
import { useUploader } from "@/features/assets/components/use-uploader";
import type { UploadTarget } from "@/features/assets/upload";
import { useInsertMedia } from "../hooks/use-insert-media";
import { usePhotoDisclosureEditor } from "./inspector/disclosure-section";
import { useEditorStore, useSelectedLayer } from "../store/editor-store";

type Tab = "photos" | "logos";

/**
 * Project photo library and the brand's logo library. Clicking a photo places it in the
 * selected image frame (keeping the frame's layout and motion) or adds a new layer.
 */
export function AssetLibrary({ target, demoMode }: { target: UploadTarget; demoMode: boolean }) {
  const assets = useEditorStore((s) => s.assets);
  const brandId = useEditorStore((s) => s.brandId);
  const addAsset = useEditorStore((s) => s.addAsset);
  const removeAsset = useEditorStore((s) => s.removeAsset);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const changePhoto = useEditorStore((s) => s.changePhoto);
  const selected = useSelectedLayer();
  const { insertPhoto, insertLogo } = useInsertMedia();
  const { items, upload, dismiss, busy } = useUploader(target);
  const [tab, setTab] = useState<Tab>("photos");
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const disclosureEditor = usePhotoDisclosureEditor();

  const photos = assets.filter((a) => a.kind === "photo");
  const logos = assets.filter((a) => a.kind === "logo");
  const canReplacePhoto = selected?.type === "image";
  const canReplaceLogo = selected?.type === "logo";

  const placePhoto = (asset: Asset) => (canReplacePhoto ? changePhoto(selected.id, asset.id) : insertPhoto(asset));
  const placeLogo = (asset: Asset) =>
    canReplaceLogo ? updateLayer(selected.id, { assetId: asset.id }) : insertLogo(asset);

  const list = tab === "photos" ? photos : logos;

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex gap-1" role="tablist" aria-label="Asset type">
        {(["photos", "logos"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-2 py-1 text-xs capitalize",
              tab === t ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t}{" "}
            <span className="text-muted-foreground tabular-nums">{t === "photos" ? photos.length : logos.length}</span>
          </button>
        ))}
      </div>

      {tab === "photos" ? (
        <FileDropZone
          kind="photo"
          label="Upload photos"
          hint="JPG, PNG, WebP · drop files here or onto the canvas"
          onFiles={(files) => void upload(files, "photo").then((uploaded) => uploaded.forEach(addAsset))}
          disabled={busy}
          testId="photo-upload-input"
        />
      ) : (
        <FileDropZone
          kind="logo"
          label="Upload logos"
          hint="SVG, PNG, WebP · saved to the Brand Kit"
          onFiles={(files) =>
            void upload(files, "logo", () => ({ metadata: { variant: "Primary" } })).then((uploaded) =>
              uploaded.forEach(addAsset),
            )
          }
          disabled={busy}
        />
      )}
      <UploadQueue items={items} onDismiss={dismiss} />

      <p className="text-muted-foreground px-0.5 text-[11px] leading-relaxed">
        {tab === "photos"
          ? canReplacePhoto
            ? "Click a photo to replace the selected frame’s photo (layout and motion are kept)."
            : "Click a photo to add it as a new layer."
          : canReplaceLogo
            ? "Click a logo to replace the selected logo."
            : "Click a logo to add it to the scene."}
        {demoMode && " Demo Mode: uploads last until the dev server restarts."}
      </p>

      {list.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
          {tab === "photos" ? "No photos in this project yet." : "No logos in this brand’s Brand Kit yet."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5" aria-label={tab === "photos" ? "Project photos" : "Brand logos"}>
          {list.map((asset) => {
            const inUse = selected && "assetId" in selected && selected.assetId === asset.id;
            const canReplace = tab === "photos" ? canReplacePhoto : canReplaceLogo;
            return (
              <li key={asset.id} className="group relative">
                <button
                  type="button"
                  onClick={() => (tab === "photos" ? placePhoto(asset) : placeLogo(asset))}
                  title={`${assetLabel(asset)}${asset.width ? ` · ${asset.width}×${asset.height}` : ""}`}
                  className={cn(
                    "hover:ring-ring/40 block aspect-square w-full overflow-hidden rounded-md border transition-shadow hover:ring-2",
                    tab === "logos"
                      ? "bg-[repeating-conic-gradient(#e5e5e5_0_25%,#fff_0_50%)] bg-[length:12px_12px]"
                      : "bg-muted",
                    inUse ? "border-primary ring-primary/50 ring-2" : "border-border",
                  )}
                >
                  <AssetThumb asset={asset} />
                </button>
                {tab === "photos" && asset.metadata.requiresDisclosure && (
                  <span
                    className="absolute bottom-5 left-1 flex items-center gap-0.5 rounded bg-amber-400 px-1 text-[9px] font-semibold text-amber-950"
                    title={asset.metadata.disclosureText ?? "Requires disclosure"}
                    data-testid="photo-disclosure-badge"
                  >
                    <ShieldCheck className="size-2.5" aria-hidden /> Disclosure
                  </span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="bg-background/90 absolute top-1 right-1 rounded p-0.5 opacity-0 shadow-sm group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                    aria-label={`Actions for ${assetLabel(asset)}`}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => (tab === "photos" ? insertPhoto(asset) : insertLogo(asset))}>
                      <ImagePlus /> Add as new layer
                    </DropdownMenuItem>
                    {canReplace && selected && (
                      <DropdownMenuItem
                        onSelect={() =>
                          tab === "photos"
                            ? changePhoto(selected.id, asset.id)
                            : updateLayer(selected.id, { assetId: asset.id })
                        }
                      >
                        <Replace /> Replace in selected layer
                      </DropdownMenuItem>
                    )}
                    {tab === "photos" && (
                      <DropdownMenuItem
                        onSelect={() => disclosureEditor.open(asset)}
                        data-testid="photo-disclosure-menu"
                      >
                        <ShieldCheck /> Photo disclosure…
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {tab === "photos" ? (
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(asset)}>
                        <Trash2 /> Delete file…
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem asChild>
                        <Link href={`/brands/${brandId}/settings#logos`}>Manage in Brand Kit</Link>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-muted-foreground mt-0.5 truncate text-[10px]">{assetLabel(asset)}</p>
              </li>
            );
          })}
        </ul>
      )}

      <DeleteAssetDialog asset={deleting} onOpenChange={(o) => !o && setDeleting(null)} onDeleted={removeAsset} />
      {disclosureEditor.dialog}
    </div>
  );
}
