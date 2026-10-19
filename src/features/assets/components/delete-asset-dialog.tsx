"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { assetLabel, type Asset, type AssetUsage } from "@/domain/asset";
import { deleteAsset } from "../actions";

/**
 * Permanently deleting an uploaded file. Unlike removing a layer or unassigning a photo,
 * this removes the file itself, so in-use files show where they're used first.
 */
export function DeleteAssetDialog({
  asset,
  onOpenChange,
  onDeleted,
  extraWarning,
}: {
  asset: Asset | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: (assetId: string) => void;
  /** e.g. "This font is the Brand Kit headline font." */
  extraWarning?: string | null;
}) {
  const [usage, setUsage] = useState<AssetUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setUsage(null);
    setError(null);
    onOpenChange(false);
  };

  const run = (confirmInUse: boolean) =>
    startTransition(async () => {
      if (!asset) return;
      setError(null);
      const result = await deleteAsset(asset.id, confirmInUse);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.deleted) {
        onDeleted(asset.id);
        close();
      } else {
        setUsage(result.data.usage);
      }
    });

  const kindLabel = asset?.kind === "photo" ? "photo" : asset?.kind === "logo" ? "logo" : "font";

  return (
    <Dialog open={asset !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {kindLabel} file?</DialogTitle>
          <DialogDescription>
            {asset ? `“${assetLabel(asset)}”` : ""} will be permanently deleted from storage. This can’t be undone.
          </DialogDescription>
        </DialogHeader>
        {extraWarning && <p className="text-sm text-amber-700 dark:text-amber-400">{extraWarning}</p>}
        {usage && usage.length > 0 && (
          <div className="space-y-2 text-sm">
            <p className="text-amber-700 dark:text-amber-400">
              It’s used in {usage.length} {usage.length === 1 ? "scene" : "scenes"}. Those layers will show
              “unavailable” until you choose a replacement. Consider replacing the file instead.
            </p>
            <ul className="text-muted-foreground max-h-40 list-inside list-disc overflow-y-auto text-xs">
              {usage.map((u) => (
                <li key={u.sceneId}>
                  {u.projectName} — {u.sceneName}
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={() => run(Boolean(usage?.length))}>
            {pending ? "Checking…" : usage?.length ? "Delete anyway" : "Delete file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
