"use client";

import { useState } from "react";
import { Section } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { assetLabel } from "@/domain/asset";
import type { ImageLayer, LogoLayer } from "@/domain/scene";
import { AssetPickerDialog, AssetThumb } from "@/features/assets/components/asset-picker-dialog";
import type { UploadTarget } from "@/features/assets/upload";
import { useEditorStore } from "../../store/editor-store";

/**
 * Shows which file a photo/logo layer uses, with Replace (upload or library) and Remove.
 * Replacing only swaps `assetId`: frame, crop, rotation, opacity, order and motion stay.
 * Removing unassigns the file from this layer; the file stays in the library.
 */
export function MediaSource({
  layer,
  title,
  children,
}: {
  layer: ImageLayer | LogoLayer;
  title?: string;
  children?: React.ReactNode;
}) {
  const assets = useEditorStore((s) => s.assets);
  const addAsset = useEditorStore((s) => s.addAsset);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const changePhoto = useEditorStore((s) => s.changePhoto);
  // Photos go through changePhoto so their disclosure follows (with a prompt if needed).
  const setAsset = (assetId: string | null) =>
    layer.type === "image" ? changePhoto(layer.id, assetId) : updateLayer(layer.id, { assetId }, `${layer.id}:assetId`);
  const target = useEditorStore((s) => s.uploadTarget) as UploadTarget;
  const [open, setOpen] = useState(false);
  const kind = layer.type === "logo" ? "logo" : "photo";
  const asset = assets.find((a) => a.id === layer.assetId);
  const missing = layer.assetId && !asset;

  return (
    <Section title={title ?? (kind === "logo" ? "Logo" : "Image")}>
      <div className="flex items-center gap-2">
        <div className="border-border bg-muted h-10 w-10 shrink-0 overflow-hidden rounded-md border">
          {asset && <AssetThumb asset={asset} />}
        </div>
        <p
          className="text-muted-foreground min-w-0 flex-1 truncate text-xs"
          title={asset ? assetLabel(asset) : undefined}
        >
          {asset
            ? assetLabel(asset)
            : missing
              ? "File unavailable (deleted)"
              : kind === "logo"
                ? "No logo"
                : "No photo"}
        </p>
      </div>
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="xs"
          className="flex-1"
          onClick={() => setOpen(true)}
          data-testid="replace-media"
        >
          {layer.assetId ? `Replace ${kind}…` : `Choose ${kind}…`}
        </Button>
        {layer.assetId && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setAsset(null)}
            title="Unassign from this layer (the file stays in the library)"
          >
            Remove
          </Button>
        )}
      </div>
      {children}
      <AssetPickerDialog
        open={open}
        onOpenChange={setOpen}
        kind={kind}
        title={layer.assetId ? `Replace ${kind}` : `Choose ${kind}`}
        description="Position, size, crop, rotation, opacity, layer order and motion are kept."
        assets={assets}
        target={kind === "logo" ? { ...target, projectId: null } : target}
        currentAssetId={layer.assetId}
        onUploaded={(uploaded) => uploaded.forEach(addAsset)}
        onPick={(picked) => setAsset(picked.id)}
        pickLabel={layer.assetId ? "Replace" : "Use"}
      />
    </Section>
  );
}
