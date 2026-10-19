"use client";

import { Bookmark, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { entranceLabel } from "@/domain/motion";
import {
  applyMotionPreset,
  presetMotionFrom,
  presetTargetFor,
  STARTER_PRESETS,
  type MotionPreset,
} from "@/domain/motion-presets";
import type { Layer } from "@/domain/scene";
import { deleteMotionPreset, saveMotionPreset } from "@/features/projects/actions";
import { useEditorStore } from "../../store/editor-store";

const ROLE_LABELS: Record<string, string> = {
  headline: "headlines",
  subtitle: "subtitles",
  primaryImage: "main photos",
  secondaryImage: "second photos",
  logo: "logos",
  cta: "CTA labels",
  ctaButton: "CTA buttons",
  scrim: "gradients",
};

/** Apply, save and manage reusable motion settings (project-level). */
export function MotionPresetsMenu({ layer }: { layer: Layer }) {
  const projectId = useEditorStore((s) => s.projectId);
  const presets = useEditorStore((s) => s.motionPresets);
  const setMotionPresets = useEditorStore((s) => s.setMotionPresets);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const applyMotionToRole = useEditorStore((s) => s.applyMotionToRole);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const target = presetTargetFor(layer);
  const fits = (p: MotionPreset) => p.appliesTo === "any" || p.appliesTo === target;
  const starters = STARTER_PRESETS.filter(fits);
  const projectPresets = presets.filter(fits);

  const apply = (preset: MotionPreset) => updateLayer(layer.id, { motion: applyMotionPreset(layer, preset) });

  const openSave = () => {
    setName(`${layer.name} — ${entranceLabel(layer.motion.entrance)}`.slice(0, 60));
    setError(null);
    setDialogOpen(true);
  };

  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await saveMotionPreset(projectId, {
        id: crypto.randomUUID(),
        name: name.trim(),
        appliesTo: target,
        motion: presetMotionFrom(layer),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMotionPresets(result.data);
      setName("");
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deleteMotionPreset(projectId, id);
      if (result.ok) setMotionPresets(result.data);
      else setError(result.error);
    });

  const roleLabel = layer.role ? ROLE_LABELS[layer.role] : undefined;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" data-testid="motion-presets" title="Motion presets">
            <Bookmark /> Presets
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Starter presets</DropdownMenuLabel>
          {starters.length === 0 && (
            <p className="text-muted-foreground px-2 py-1 text-xs">None for this layer type.</p>
          )}
          {starters.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => apply(p)}>
              {p.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Project presets</DropdownMenuLabel>
          {projectPresets.length === 0 && (
            <p className="text-muted-foreground px-2 py-1 text-xs">
              Save one from any layer to reuse it in every scene.
            </p>
          )}
          {projectPresets.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => apply(p)}>
              {p.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openSave}>Save current motion as preset…</DropdownMenuItem>
          {roleLabel && (
            <DropdownMenuItem
              onSelect={() => {
                const motion = presetMotionFrom(layer);
                const count = applyMotionToRole(layer.role!, (l) =>
                  applyMotionPreset(l as Layer, { id: "copy", name: "copy", appliesTo: "any", motion }),
                );
                setNotice(`Applied to ${count} ${roleLabel} across the project.`);
                setTimeout(() => setNotice(null), 3000);
              }}
            >
              Apply this motion to all {roleLabel} in the project
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {notice && (
        <span role="status" className="text-muted-foreground text-[10px]">
          {notice}
        </span>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Motion presets</DialogTitle>
            <DialogDescription>
              Saves this layer’s timing, entrance, camera motion and exit for reuse in any scene of this project.
              Applying a preset copies its values; editing a preset later doesn’t change layers.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              aria-label="Preset name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Headline — Fade In + Slide Up"
            />
            <Button onClick={save} disabled={pending || !name.trim()}>
              Save
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div>
            <p className="text-muted-foreground mb-1 text-xs">Project presets ({presets.length})</p>
            {presets.length === 0 ? (
              <p className="text-muted-foreground text-xs">None yet.</p>
            ) : (
              <ul
                className="divide-border max-h-48 divide-y overflow-y-auto rounded-md border"
                aria-label="Project presets"
              >
                {presets.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-muted-foreground text-[11px]">
                      {p.appliesTo === "any" ? "Any layer" : p.appliesTo}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete preset ${p.name}`}
                      onClick={() => remove(p.id)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
