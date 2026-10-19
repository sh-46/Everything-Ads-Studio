"use client";

import { AlertTriangle, ShieldCheck, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "cn";
import { NumberField, Section, SelectField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { assetLabel, photoDisclosureText, type Asset, type PhotoDisclosure } from "@/domain/asset";
import { disclosureLayersFor, type DisclosureFix, type DisclosureIssue } from "@/domain/disclosures";
import { computeSceneTimings } from "@/domain/motion-engine";
import type { Layer, TextLayer, VisibilityMode } from "@/domain/scene";
import { layerWindow } from "@/domain/visibility";
import { AssetThumb } from "@/features/assets/components/asset-picker-dialog";
import { PhotoDisclosureDialog } from "@/features/assets/components/photo-disclosure-dialog";
import { useDisclosureIssues } from "../../hooks/use-disclosure-issues";
import { useActiveScene, useEditorStore } from "../../store/editor-store";
import { Hint } from "./motion-parts";

const sec = (ms: number) => Number((ms / 1000).toFixed(2));
const FIX_LABELS: Record<DisclosureFix, string> = {
  add: "Add disclosure",
  show: "Show it",
  fitHeight: "Fit box to text",
  moveIntoSafeArea: "Move into safe area",
  remove: "Remove layer",
  editText: "Add wording",
};

/** One review finding with its quick fix. */
export function IssueRow({ issue, onEditText }: { issue: DisclosureIssue; onEditText?: () => void }) {
  const fixDisclosure = useEditorStore((s) => s.fixDisclosure);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  return (
    <li
      className={cn(
        "flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px] leading-snug",
        issue.severity === "error"
          ? "border-destructive/40 text-destructive"
          : "border-amber-500/40 text-amber-800 dark:text-amber-300",
      )}
      data-testid="disclosure-issue"
      data-severity={issue.severity}
    >
      <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {issue.message}
        <span className="mt-1 flex flex-wrap gap-1">
          {issue.fix && issue.fix !== "editText" && (
            <Button variant="outline" size="xs" onClick={() => fixDisclosure(issue)} data-testid={`fix-${issue.fix}`}>
              <Wrench /> {FIX_LABELS[issue.fix]}
            </Button>
          )}
          {issue.fix === "editText" && onEditText && (
            <Button variant="outline" size="xs" onClick={onEditText}>
              {FIX_LABELS.editText}
            </Button>
          )}
          {issue.layerId && (
            <Button variant="ghost" size="xs" onClick={() => selectLayer(issue.layerId!)}>
              Select
            </Button>
          )}
          {!issue.layerId && issue.imageLayerId && (
            <Button variant="ghost" size="xs" onClick={() => selectLayer(issue.imageLayerId!)}>
              Select photo
            </Button>
          )}
        </span>
      </span>
    </li>
  );
}

/** Edits a photo's disclosure and updates every scene in the editor that uses it. */
export function usePhotoDisclosureEditor() {
  const [asset, setAsset] = useState<Asset | null>(null);
  const updateAsset = useEditorStore((s) => s.updateAsset);
  const syncAssetDisclosures = useEditorStore((s) => s.syncAssetDisclosures);
  const scenes = useEditorStore((s) => s.scenes);

  const impact = (next: PhotoDisclosure) => {
    if (!asset) return null;
    let frames = 0;
    let layers = 0;
    for (const scene of Object.values(scenes)) {
      for (const l of scene.document.layers) {
        if (l.type !== "image" || l.assetId !== asset.id) continue;
        frames++;
        layers += disclosureLayersFor(scene.document, l.id).length;
      }
    }
    if (frames === 0) return null;
    if (next.requiresDisclosure && frames > layers)
      return `Adds a disclosure layer where this photo is used without one (${frames - layers} of ${frames}).`;
    if (!next.requiresDisclosure && layers > 0)
      return `Removes this photo’s disclosure layer from ${layers} ${layers === 1 ? "place" : "places"} in your scenes.`;
    if (next.requiresDisclosure) return `Updates the wording in ${layers} ${layers === 1 ? "place" : "places"}.`;
    return null;
  };

  const dialog = (
    <PhotoDisclosureDialog
      asset={asset}
      onOpenChange={(open) => !open && setAsset(null)}
      impact={impact}
      onSaved={(saved) => {
        updateAsset(saved);
        syncAssetDisclosures(saved);
      }}
    />
  );
  return { open: setAsset, dialog };
}

/** Inspector section for disclosure layers: the linked photo, its wording, and checks. */
export function DisclosureSection({ layer }: { layer: TextLayer }) {
  const assets = useEditorStore((s) => s.assets);
  const issues = useDisclosureIssues().filter((i) => i.layerId === layer.id);
  const { open, dialog } = usePhotoDisclosureEditor();
  const asset = assets.find((a) => a.id === layer.disclosure?.assetId);
  const wording = photoDisclosureText(asset);

  return (
    <Section title="Disclosure" aside={<ShieldCheck className="size-3.5 text-amber-600" aria-hidden />}>
      <div className="flex items-center gap-2" data-testid="disclosure-section">
        <div className="border-border bg-muted h-9 w-12 shrink-0 overflow-hidden rounded border">
          {asset && <AssetThumb asset={asset} />}
        </div>
        <p className="text-muted-foreground min-w-0 flex-1 text-[11px] leading-snug">
          Belongs to{" "}
          <span className="text-foreground font-medium">{asset ? assetLabel(asset) : "a deleted photo"}</span>. The
          wording comes from the photo library and is the same in every scene.
        </p>
      </div>
      <blockquote
        className="border-border bg-muted/50 rounded-md border px-2 py-1.5 text-xs whitespace-pre-wrap"
        data-testid="disclosure-wording"
      >
        {wording ?? <span className="text-muted-foreground italic">No wording — this layer shows nothing.</span>}
      </blockquote>
      {asset && (
        <Button
          variant="outline"
          size="xs"
          className="w-full"
          onClick={() => open(asset)}
          data-testid="edit-disclosure"
        >
          Edit photo disclosure…
        </Button>
      )}
      <Hint>Style, size and position are per scene. Keep it static and inside the safe area (dashed guide).</Hint>
      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.map((issue, i) => (
            <IssueRow key={i} issue={issue} onEditText={asset ? () => open(asset) : undefined} />
          ))}
        </ul>
      )}
      {dialog}
    </Section>
  );
}

const MODE_LABELS: Record<VisibilityMode, string> = {
  always: "Whole scene",
  range: "Custom time range",
  linkedPhoto: "While its photo is on screen",
};

/** When the layer is on screen — independent of its motion. */
export function VisibilitySection({ layer }: { layer: Layer }) {
  const scene = useActiveScene();
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const doc = scene?.document;
  const v = layer.visibility;
  const linkable = layer.type === "text" && layer.disclosure !== null;
  const window = useMemo(
    () => (doc ? layerWindow(doc, layer, computeSceneTimings(doc.layers, doc.durationMs)) : null),
    [doc, layer],
  );
  if (!doc) return null;
  const set = (patch: Partial<Layer["visibility"]>, field: string) =>
    updateLayer(layer.id, { visibility: { ...v, ...patch } }, `${layer.id}:visibility.${field}`);
  const modes = (Object.keys(MODE_LABELS) as VisibilityMode[]).filter((m) => m !== "linkedPhoto" || linkable);
  const duration = doc.durationMs;
  const end = window ? Math.min(window.to, duration) : duration;

  return (
    <Section title="Visibility">
      <SelectField
        wide
        label="Shown"
        value={v.mode}
        options={modes.map((m) => ({ value: m, label: MODE_LABELS[m] }))}
        onChange={(mode) => set({ mode }, "mode")}
      />
      {v.mode === "range" && (
        <>
          <NumberField
            wide
            label="From"
            suffix="s"
            min={0}
            max={duration / 1000}
            step={0.1}
            precision={2}
            value={sec(v.startMs)}
            onChange={(s) => set({ startMs: Math.round(s * 1000) }, "start")}
          />
          <NumberField
            wide
            label="Until"
            suffix="s"
            min={0}
            max={duration / 1000}
            step={0.1}
            precision={2}
            value={sec(v.endMs ?? duration)}
            onChange={(s) => {
              const ms = Math.round(s * 1000);
              set({ endMs: ms >= duration ? null : ms }, "end");
            }}
          />
        </>
      )}
      {window && (
        <div className="space-y-1" data-testid="visibility-window">
          <div className="bg-muted relative h-1.5 overflow-hidden rounded-full" aria-hidden>
            <div
              className="absolute inset-y-0 bg-amber-500"
              style={{
                left: `${(Math.min(window.from, duration) / duration) * 100}%`,
                width: `${(Math.max(0, end - Math.min(window.from, duration)) / duration) * 100}%`,
              }}
            />
          </div>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {end > window.from
              ? `On screen ${sec(window.from)}s – ${sec(end)}s of ${sec(duration)}s`
              : "Not on screen in this scene"}
          </p>
        </div>
      )}
      <Hint>Visibility cuts the layer in and out (no easing). Motion, if any, still plays while it’s visible.</Hint>
    </Section>
  );
}
