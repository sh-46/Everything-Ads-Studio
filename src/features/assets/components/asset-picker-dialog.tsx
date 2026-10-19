"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { assetLabel, type Asset, type AssetKind } from "@/domain/asset";
import type { UploadTarget } from "../upload";
import { FileDropZone, UploadQueue } from "./upload-widgets";
import { useUploader } from "./use-uploader";

export function AssetThumb({ asset, className }: { asset: Asset; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed/local URL thumbnails
    <img
      src={asset.url}
      alt={assetLabel(asset)}
      loading="lazy"
      className={cn(asset.kind === "logo" ? "object-contain p-2" : "object-cover", "h-full w-full", className)}
    />
  );
}

/**
 * Pick an existing photo/logo or upload new ones from the computer, in one dialog.
 * Uploading a single file picks it immediately; with several, the user chooses.
 */
export function AssetPickerDialog({
  open,
  onOpenChange,
  kind,
  title,
  description,
  assets,
  target,
  onUploaded,
  onPick,
  pickLabel = "Use selected",
  currentAssetId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: Extract<AssetKind, "photo" | "logo">;
  title: string;
  description?: string;
  assets: Asset[];
  target: UploadTarget;
  onUploaded: (assets: Asset[]) => void;
  onPick: (asset: Asset) => void;
  pickLabel?: string;
  currentAssetId?: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { items, upload, dismiss, busy } = useUploader(target);
  const library = assets.filter((a) => a.kind === kind);

  const pick = (asset: Asset) => {
    onPick(asset);
    onOpenChange(false);
    setSelected(null);
  };

  const handleFiles = async (files: File[]) => {
    const uploaded = await upload(
      files,
      kind,
      kind === "logo" ? () => ({ metadata: { variant: "Primary" } }) : undefined,
    );
    if (uploaded.length === 0) return;
    onUploaded(uploaded);
    if (uploaded.length === 1 && files.length === 1) pick(uploaded[0]);
    else setSelected(uploaded[0].id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setSelected(null);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <FileDropZone
          kind={kind}
          label={kind === "photo" ? "Upload from computer" : "Upload logo"}
          hint={kind === "photo" ? "JPG, PNG or WebP · or drag photos here" : "SVG, PNG or WebP · or drag files here"}
          onFiles={(files) => void handleFiles(files)}
          disabled={busy}
          testId={`picker-upload-${kind}`}
        />
        <UploadQueue items={items} onDismiss={dismiss} />

        <div>
          <p className="text-muted-foreground mb-2 text-xs">
            {kind === "photo" ? "Project photo library" : "Brand Kit logo library"} · {library.length}{" "}
            {library.length === 1 ? "file" : "files"}
          </p>
          {library.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-xs">
              Nothing here yet — upload above.
            </p>
          ) : (
            <ul className="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto pr-1" aria-label="Library">
              {library.map((asset) => {
                const isSelected = selected === asset.id;
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(asset.id)}
                      onDoubleClick={() => pick(asset)}
                      aria-pressed={isSelected}
                      title={`${assetLabel(asset)}${asset.width ? ` · ${asset.width}×${asset.height}` : ""}`}
                      className={cn(
                        "relative block aspect-square w-full overflow-hidden rounded-md border transition-shadow",
                        kind === "logo"
                          ? "bg-[repeating-conic-gradient(#e5e5e5_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
                          : "bg-muted",
                        isSelected
                          ? "border-primary ring-primary/50 ring-2"
                          : "border-border hover:ring-ring/40 hover:ring-2",
                      )}
                    >
                      <AssetThumb asset={asset} />
                      {currentAssetId === asset.id && (
                        <span className="bg-background/90 absolute top-1 left-1 rounded px-1 text-[10px]">Current</span>
                      )}
                      {isSelected && (
                        <span className="bg-primary text-primary-foreground absolute top-1 right-1 rounded-full p-0.5">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>
                    <p className="text-muted-foreground mt-1 truncate text-[10px]">{assetLabel(asset)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button
            disabled={!selected}
            onClick={() => {
              const asset = library.find((a) => a.id === selected);
              if (asset) pick(asset);
            }}
          >
            {pickLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
