"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  assetLabel,
  DISCLOSURE_MAX_LENGTH,
  disclosureMetaIssue,
  type Asset,
  type PhotoDisclosure,
} from "@/domain/asset";
import { updateAssetMeta } from "../actions";
import { AssetThumb } from "./asset-picker-dialog";

/**
 * Edit a photo's disclosure in the project photo library. The wording belongs to the
 * photo, so the change applies to every scene that uses it.
 */
export function PhotoDisclosureDialog({
  asset,
  onOpenChange,
  onSaved,
  impact,
}: {
  asset: Asset | null;
  onOpenChange: (open: boolean) => void;
  /** Called with the saved asset (after the server confirms). */
  onSaved: (asset: Asset) => void | Promise<void>;
  /** Describes what saving will change in scenes, e.g. "Adds a disclosure layer to 2 scenes." */
  impact?: (next: PhotoDisclosure) => string | null;
}) {
  return (
    <Dialog open={asset !== null} onOpenChange={onOpenChange}>
      {asset && (
        <DialogBody key={asset.id} asset={asset} onOpenChange={onOpenChange} onSaved={onSaved} impact={impact} />
      )}
    </Dialog>
  );
}

function DialogBody({
  asset,
  onOpenChange,
  onSaved,
  impact,
}: {
  asset: Asset;
  onOpenChange: (open: boolean) => void;
  onSaved: (asset: Asset) => void | Promise<void>;
  impact?: (next: PhotoDisclosure) => string | null;
}) {
  const [requires, setRequires] = useState(Boolean(asset.metadata.requiresDisclosure));
  const [text, setText] = useState(asset.metadata.disclosureText ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const next: PhotoDisclosure = requires
    ? { requiresDisclosure: true, disclosureText: text.trim() }
    : { requiresDisclosure: false, disclosureText: text.trim() || undefined };
  const effect = impact?.(next) ?? null;

  const save = async () => {
    const issue = disclosureMetaIssue(next);
    if (issue) {
      setError(issue);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateAssetMeta(asset.id, { metadata: next });
    if (!result.ok) {
      setSaving(false);
      setError(result.error);
      return;
    }
    await onSaved(result.data);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <DialogContent className="sm:max-w-md" data-testid="photo-disclosure-dialog">
      <DialogHeader>
        <DialogTitle>Photo disclosure</DialogTitle>
        <DialogDescription>
          Used wherever this photo appears. Enter the exact wording you were given — Everything Ads never writes or
          changes disclosure text.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-3">
        <div className="border-border bg-muted h-12 w-16 shrink-0 overflow-hidden rounded-md border">
          <AssetThumb asset={asset} />
        </div>
        <p className="min-w-0 truncate text-sm font-medium">{assetLabel(asset)}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={requires}
          onChange={(e) => setRequires(e.target.checked)}
          data-testid="disclosure-requires"
        />
        Requires disclosure
      </label>
      {requires && (
        <Textarea
          aria-label="Disclosure text"
          placeholder="Paste the exact disclosure wording for this photo"
          className="min-h-20 text-sm"
          maxLength={DISCLOSURE_MAX_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="disclosure-text"
        />
      )}
      {effect && (
        <p
          className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300"
          data-testid="disclosure-impact"
        >
          <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {effect}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving} data-testid="disclosure-save">
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
