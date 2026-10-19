"use client";

import { Check, Loader2, Replace, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ACCEPT,
  assetLabel,
  brandFontsFromAssets,
  LOGO_VARIANTS,
  type Asset,
  type AssetKind,
  type AssetMetaUpdate,
} from "@/domain/asset";
import type { BrandKit } from "@/domain/brand-kit";
import { FONT_WEIGHTS, fontStack } from "@/domain/fonts";
import { updateAssetMeta } from "@/features/assets/actions";
import { AssetThumb } from "@/features/assets/components/asset-picker-dialog";
import { DeleteAssetDialog } from "@/features/assets/components/delete-asset-dialog";
import { FileDropZone, UploadQueue } from "@/features/assets/components/upload-widgets";
import { useUploader } from "@/features/assets/components/use-uploader";
import { prepareFile, replaceAsset, type UploadTarget } from "@/features/assets/upload";
import { useBrandFonts } from "@/features/fonts/use-brand-fonts";

type SetAssets = (update: (assets: Asset[]) => Asset[]) => void;

function ReplaceFileButton({
  asset,
  kind,
  target,
  onReplaced,
}: {
  asset: Asset;
  kind: AssetKind;
  target: UploadTarget;
  onReplaced: (asset: Asset) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[kind]}
        className="sr-only"
        aria-label={`Replace file for ${assetLabel(asset)}`}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setState({ busy: true });
          try {
            const prepared = await prepareFile(file, kind);
            onReplaced(await replaceAsset(asset, prepared, target));
            setState({ busy: false });
          } catch (error) {
            setState({ busy: false, error: error instanceof Error ? error.message : "Replace failed" });
          }
        }}
      />
      <Button
        variant="ghost"
        size="xs"
        disabled={state.busy}
        onClick={() => inputRef.current?.click()}
        title="Upload a new file in place of this one. Every scene using it updates; layouts are unchanged."
      >
        {state.busy ? <Loader2 className="animate-spin" /> : <Replace />} Replace file
      </Button>
      {state.error && <span className="text-destructive text-[11px]">{state.error}</span>}
    </>
  );
}

function useMetaSaver(setAssets: SetAssets) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = (assetId: string, update: AssetMetaUpdate, onDone?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await updateAssetMeta(assetId, update);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAssets((list) => list.map((a) => (a.id === assetId ? result.data : a)));
      onDone?.();
    });
  return { save, pending, error };
}

// --------------------------------------------------------------------------- fonts

function FontRow({
  asset,
  status,
  target,
  setAssets,
  onDelete,
}: {
  asset: Asset;
  status: "loading" | "loaded" | "error" | undefined;
  target: UploadTarget;
  setAssets: SetAssets;
  onDelete: (asset: Asset) => void;
}) {
  const [family, setFamily] = useState(asset.metadata.family ?? "");
  const [weight, setWeight] = useState(String(asset.metadata.weight ?? 400));
  const [style, setStyle] = useState<"normal" | "italic">(asset.metadata.style ?? "normal");
  const { save, pending, error } = useMetaSaver(setAssets);
  const dirty =
    family.trim() !== (asset.metadata.family ?? "") ||
    Number(weight) !== (asset.metadata.weight ?? 400) ||
    style !== (asset.metadata.style ?? "normal");

  return (
    <li
      className="border-border grid gap-3 border-b py-3 last:border-0 md:grid-cols-[1.2fr_1fr]"
      data-testid="font-row"
    >
      <div className="min-w-0">
        <p
          className="truncate text-2xl"
          style={{
            fontFamily: fontStack(asset.metadata.family ?? ""),
            fontWeight: asset.metadata.weight,
            fontStyle: asset.metadata.style,
          }}
        >
          The 2026 model, considered
        </p>
        <p className="text-muted-foreground mt-1 truncate text-[11px]">
          {asset.originalFilename} ·{" "}
          {status === "loaded" ? (
            <span className="text-emerald-700 dark:text-emerald-400">loaded</span>
          ) : status === "error" ? (
            <span className="text-destructive">failed to load — preview uses a fallback</span>
          ) : (
            "loading…"
          )}
        </p>
      </div>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[1fr_84px_92px] gap-1.5">
          <Input
            aria-label="Font family"
            className="h-7 text-xs"
            value={family}
            maxLength={80}
            onChange={(e) => setFamily(e.target.value)}
          />
          <Select value={weight} onValueChange={setWeight}>
            <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label="Weight">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map((w) => (
                <SelectItem key={w} value={String(w)} className="text-xs">
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={style} onValueChange={(v) => setStyle(v as "normal" | "italic")}>
            <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label="Style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal" className="text-xs">
                Normal
              </SelectItem>
              <SelectItem value="italic" className="text-xs">
                Italic
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="xs"
            variant="outline"
            disabled={!dirty || !family.trim() || pending}
            onClick={() => save(asset.id, { metadata: { family: family.trim(), weight: Number(weight), style } })}
          >
            <Check /> Save details
          </Button>
          <ReplaceFileButton
            asset={asset}
            kind="font"
            target={target}
            onReplaced={(a) => setAssets((list) => list.map((x) => (x.id === a.id ? a : x)))}
          />
          <Button variant="ghost" size="xs" onClick={() => onDelete(asset)}>
            <Trash2 /> Remove
          </Button>
        </div>
        {dirty && family.trim() !== (asset.metadata.family ?? "") && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            Renaming the family: text already using “{asset.metadata.family}” will show a fallback until updated.
          </p>
        )}
        {error && <p className="text-destructive text-[11px]">{error}</p>}
      </div>
    </li>
  );
}

export function FontLibrary({
  assets,
  setAssets,
  target,
  kit,
  demoMode,
}: {
  assets: Asset[];
  setAssets: SetAssets;
  target: UploadTarget;
  kit: BrandKit;
  demoMode: boolean;
}) {
  const fonts = assets.filter((a) => a.kind === "font");
  const { status } = useBrandFonts(brandFontsFromAssets(assets));
  const { items, upload, dismiss, busy } = useUploader(target);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const kitUses = (asset: Asset | null) =>
    asset?.metadata.family
      ? Object.entries(kit.typography)
          .filter(([, style]) => style.fontFamily === asset.metadata.family)
          .map(([ref]) => ref)
      : [];
  const usedBy = kitUses(deleting);

  return (
    <div className="space-y-3">
      <FileDropZone
        kind="font"
        label="Upload fonts"
        hint="TTF, OTF, WOFF or WOFF2 · several files at once (one per weight/style)"
        onFiles={(files) => void upload(files, "font").then((uploaded) => setAssets((list) => [...list, ...uploaded]))}
        disabled={busy}
        testId="font-upload-input"
      />
      <UploadQueue items={items} onDismiss={dismiss} />
      <p className="text-muted-foreground text-xs">
        Family, weight and style are read from the font file where possible (from the file name for WOFF2). Correct them
        below — the family name is what appears in the typography menus and the editor.
        {demoMode && " Demo Mode: fonts are kept in memory until the dev server restarts."}
      </p>
      {fonts.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
          No custom fonts yet. System fonts are used until you upload the OEM’s fonts.
        </p>
      ) : (
        <ul aria-label="Uploaded fonts">
          {fonts.map((font) => (
            <FontRow
              key={font.id}
              asset={font}
              status={font.metadata.family ? status[font.metadata.family] : undefined}
              target={target}
              setAssets={setAssets}
              onDelete={setDeleting}
            />
          ))}
        </ul>
      )}
      <DeleteAssetDialog
        asset={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={(id) => setAssets((list) => list.filter((a) => a.id !== id))}
        extraWarning={
          usedBy.length > 0
            ? `The Brand Kit ${usedBy.join(", ")} style uses this family. Pick another font there first, or new layers will use a fallback.`
            : null
        }
      />
    </div>
  );
}

// --------------------------------------------------------------------------- logos

function LogoCard({
  asset,
  target,
  setAssets,
  onDelete,
}: {
  asset: Asset;
  target: UploadTarget;
  setAssets: SetAssets;
  onDelete: (asset: Asset) => void;
}) {
  const [name, setName] = useState(asset.displayName ?? "");
  const { save, pending, error } = useMetaSaver(setAssets);
  const variant = asset.metadata.variant ?? "Primary";
  const dark = variant === "White";

  return (
    <li className="border-border rounded-lg border p-3" data-testid="logo-card">
      <div
        className={`flex aspect-[3/1] items-center justify-center overflow-hidden rounded-md ${
          dark ? "bg-neutral-900" : "bg-[repeating-conic-gradient(#e5e5e5_0_25%,#fff_0_50%)] bg-[length:16px_16px]"
        }`}
      >
        <AssetThumb asset={asset} />
      </div>
      <div className="mt-2 grid grid-cols-[1fr_112px] gap-1.5">
        <Input
          aria-label="Logo name"
          className="h-7 text-xs"
          placeholder={asset.originalFilename}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const next = name.trim() || null;
            if (next !== asset.displayName) save(asset.id, { displayName: next });
          }}
        />
        <Select value={variant} onValueChange={(v) => save(asset.id, { metadata: { variant: v } })}>
          <SelectTrigger size="sm" className="h-7 w-full text-xs" aria-label="Variant">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOGO_VARIANTS.map((v) => (
              <SelectItem key={v} value={v} className="text-xs">
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <ReplaceFileButton
          asset={asset}
          kind="logo"
          target={target}
          onReplaced={(a) => setAssets((list) => list.map((x) => (x.id === a.id ? a : x)))}
        />
        <Button variant="ghost" size="xs" onClick={() => onDelete(asset)}>
          <Trash2 /> Remove
        </Button>
        {pending && <Loader2 className="text-muted-foreground size-3 animate-spin" />}
      </div>
      <p className="text-muted-foreground mt-1 text-[10px]">
        {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}
        {asset.mimeType === "image/svg+xml" ? "SVG" : asset.mimeType.split("/")[1]?.toUpperCase()}
      </p>
      {error && <p className="text-destructive text-[11px]">{error}</p>}
    </li>
  );
}

export function LogoLibrary({
  assets,
  setAssets,
  target,
}: {
  assets: Asset[];
  setAssets: SetAssets;
  target: UploadTarget;
}) {
  const logos = assets.filter((a) => a.kind === "logo");
  const { items, upload, dismiss, busy } = useUploader(target);
  const [deleting, setDeleting] = useState<Asset | null>(null);
  return (
    <div className="space-y-3">
      <FileDropZone
        kind="logo"
        label="Upload logos"
        hint="SVG, PNG or WebP with transparency · several variants at once"
        onFiles={(files) =>
          void upload(files, "logo", (file) => ({
            displayName: file.name.replace(/\.[^.]+$/, "").slice(0, 80),
            metadata: { variant: /white/i.test(file.name) ? "White" : /black/i.test(file.name) ? "Black" : "Primary" },
          })).then((uploaded) => setAssets((list) => [...list, ...uploaded]))
        }
        disabled={busy}
        testId="logo-upload-input"
      />
      <UploadQueue items={items} onDismiss={dismiss} />
      {logos.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">No logos yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Logo library">
          {logos.map((logo) => (
            <LogoCard key={logo.id} asset={logo} target={target} setAssets={setAssets} onDelete={setDeleting} />
          ))}
        </ul>
      )}
      <DeleteAssetDialog
        asset={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onDeleted={(id) => setAssets((list) => list.filter((a) => a.id !== id))}
      />
    </div>
  );
}
