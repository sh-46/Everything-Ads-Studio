"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ColorField, FieldRow, NumberField, SelectField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrandKit, TypeStyle } from "@/domain/brand-kit";
import { hexToRgba } from "@/domain/color";
import { formatExportName } from "@/domain/export-config";
import { FONT_WEIGHTS, SYSTEM_FONT_FAMILIES } from "@/domain/fonts";
import { TYPE_STYLE_REFS, type TypeStyleRef } from "@/domain/scene";
import { renameBrand, updateBrandKit } from "../actions";

const STYLE_LABELS: Record<TypeStyleRef, string> = {
  headline: "Headline",
  subtitle: "Subtitle",
  body: "Body",
  cta: "CTA",
};

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border-border rounded-xl border p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TypeStyleEditor({
  label,
  style,
  onChange,
}: {
  label: string;
  style: TypeStyle;
  onChange: (style: TypeStyle) => void;
}) {
  const set = <K extends keyof TypeStyle>(key: K, value: TypeStyle[K]) => onChange({ ...style, [key]: value });
  const fonts = [...new Set([style.fontFamily, ...SYSTEM_FONT_FAMILIES])].map((f) => ({ value: f, label: f }));
  return (
    <div className="border-border grid gap-4 border-b py-4 last:border-0 md:grid-cols-[1fr_1.2fr]">
      <div className="space-y-2">
        <p className="text-xs font-medium">{label}</p>
        <SelectField label="Font" value={style.fontFamily} options={fonts} onChange={(v) => set("fontFamily", v)} />
        <FieldRow>
          <NumberField label="Size" min={4} max={1000} value={style.fontSize} onChange={(v) => set("fontSize", v)} />
          <SelectField
            label="Wt"
            value={String(style.fontWeight)}
            options={FONT_WEIGHTS.map((w) => ({ value: String(w), label: String(w) }))}
            onChange={(v) => set("fontWeight", Number(v))}
          />
          <NumberField
            label="Track"
            step={0.5}
            precision={1}
            min={-50}
            max={200}
            value={style.letterSpacing}
            onChange={(v) => set("letterSpacing", v)}
          />
          <NumberField
            label="Lead"
            step={0.05}
            precision={2}
            min={0.5}
            max={4}
            value={style.lineHeight}
            onChange={(v) => set("lineHeight", v)}
          />
        </FieldRow>
        <ColorField label="Color" value={style.color} onChange={(v) => set("color", v)} />
      </div>
      <div className="flex items-center overflow-hidden rounded-lg bg-neutral-900 p-4">
        {/* Preview at 50% of the 1080-wide production size. */}
        <p
          style={{
            fontFamily: style.fontFamily,
            fontSize: style.fontSize / 2,
            fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing / 2,
            lineHeight: style.lineHeight,
            color: style.color,
          }}
        >
          {label} sample text
        </p>
      </div>
    </div>
  );
}

export function BrandKitForm({
  brandId,
  brandName,
  initialKit,
  initialRevision,
}: {
  brandId: string;
  brandName: string;
  initialKit: BrandKit;
  initialRevision: number;
}) {
  const router = useRouter();
  const [kit, setKit] = useState(initialKit);
  const [name, setName] = useState(brandName);
  const [revision, setRevision] = useState(initialRevision);
  const [status, setStatus] = useState<{ kind: "idle" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState({ kit: initialKit, name: brandName });
  const dirty = kit !== saved.kit || name !== saved.name;

  const update = <K extends keyof BrandKit>(key: K, value: BrandKit[K]) => {
    setKit((k) => ({ ...k, [key]: value }));
    setStatus({ kind: "idle" });
  };

  const save = () =>
    startTransition(async () => {
      if (name.trim() !== saved.name) {
        const renamed = await renameBrand(brandId, name);
        if (!renamed.ok) {
          setStatus({ kind: "error", message: renamed.error });
          return;
        }
      }
      const result = await updateBrandKit(brandId, revision, kit);
      if (!result.ok) {
        setStatus({ kind: "error", message: result.error });
        return;
      }
      setRevision(result.data.revision);
      setSaved({ kit, name: name.trim() });
      setStatus({ kind: "saved" });
      router.refresh();
    });

  const scrim = kit.scrim;
  const scrimPreview = `linear-gradient(${scrim.angle}deg, ${scrim.stops.map((s) => `${hexToRgba(s.color, s.opacity)} ${s.offset * 100}%`).join(", ")})`;

  return (
    <div className="space-y-6">
      <div className="border-border bg-background/95 sticky top-12 z-10 -mx-2 flex items-center justify-between gap-4 rounded-lg border px-4 py-2.5 backdrop-blur">
        <p className="text-muted-foreground text-xs">
          Changes apply to new layers and layouts. Existing scenes keep their current styling (local overrides).
        </p>
        <div className="flex shrink-0 items-center gap-3">
          {status.kind === "saved" && <span className="text-muted-foreground text-xs">Saved</span>}
          {status.kind === "error" && (
            <span role="alert" className="text-destructive max-w-xs text-xs">
              {status.message}
            </span>
          )}
          <Button size="sm" onClick={save} disabled={pending || (!dirty && status.kind !== "error")}>
            {pending ? "Saving…" : "Save brand kit"}
          </Button>
        </div>
      </div>

      <Card title="Brand">
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="brand-name">Name</Label>
          <Input id="brand-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
      </Card>

      <Card title="Colors">
        <div className="grid max-w-2xl gap-2 sm:grid-cols-2">
          {(["background", "primary", "accent", "text"] as const).map((key) => (
            <div key={key} className="flex items-center gap-3">
              <span className="text-muted-foreground w-20 text-xs capitalize">{key}</span>
              <div className="flex-1">
                <ColorField
                  label=""
                  value={kit.colors[key]}
                  onChange={(v) => update("colors", { ...kit.colors, [key]: v })}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Typography" description="Sizes are in pixels on the 1080-wide production canvas.">
        {TYPE_STYLE_REFS.map((ref) => (
          <TypeStyleEditor
            key={ref}
            label={STYLE_LABELS[ref]}
            style={kit.typography[ref]}
            onChange={(style) => update("typography", { ...kit.typography, [ref]: style })}
          />
        ))}
      </Card>

      <Card title="Photo scrim" description="Default gradient layout presets place over photography.">
        <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
          <div className="space-y-2">
            <NumberField
              label="Angle"
              suffix="°"
              min={-360}
              max={360}
              value={scrim.angle}
              onChange={(angle) => update("scrim", { ...scrim, angle })}
            />
            {scrim.stops.map((stop, i) => (
              <FieldRow key={i}>
                <ColorField
                  label={i === 0 ? "From" : "To"}
                  value={stop.color}
                  onChange={(color) =>
                    update("scrim", { ...scrim, stops: scrim.stops.map((s, j) => (j === i ? { ...s, color } : s)) })
                  }
                />
                <NumberField
                  label="Opac"
                  suffix="%"
                  min={0}
                  max={100}
                  value={Math.round(stop.opacity * 100)}
                  onChange={(v) =>
                    update("scrim", {
                      ...scrim,
                      stops: scrim.stops.map((s, j) => (j === i ? { ...s, opacity: v / 100 } : s)),
                    })
                  }
                />
              </FieldRow>
            ))}
          </div>
          <div className="h-32 rounded-lg bg-[linear-gradient(135deg,#6b7280,#d1d5db)]" aria-hidden>
            <div className="h-full w-full rounded-lg" style={{ background: scrimPreview }} />
          </div>
        </div>
      </Card>

      <Card title="Call to action">
        <div className="grid max-w-2xl gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground w-9 shrink-0 text-[11px]">Label</span>
            <Input
              className="h-7 text-xs"
              value={kit.cta.label}
              maxLength={40}
              onChange={(e) => update("cta", { ...kit.cta, label: e.target.value || kit.cta.label })}
            />
          </div>
          <NumberField
            label="Radius"
            min={0}
            max={200}
            value={kit.cta.cornerRadius}
            onChange={(cornerRadius) => update("cta", { ...kit.cta, cornerRadius })}
          />
          <ColorField
            label="Fill"
            value={kit.cta.background}
            onChange={(background) => update("cta", { ...kit.cta, background })}
          />
          <ColorField
            label="Text"
            value={kit.cta.textColor}
            onChange={(textColor) => update("cta", { ...kit.cta, textColor })}
          />
        </div>
      </Card>

      <Card title="Export naming" description="Tokens: {brand} {year} {model} {scene} {width} {height}">
        <div className="max-w-xl space-y-2">
          <Input
            aria-label="Filename pattern"
            className="font-mono text-xs"
            value={kit.exportNaming.pattern}
            maxLength={200}
            onChange={(e) => update("exportNaming", { pattern: e.target.value || "{scene}" })}
          />
          <p className="text-muted-foreground font-mono text-xs">
            {formatExportName(kit.exportNaming.pattern, {
              brand: name || "Brand",
              year: 2026,
              model: "Model",
              scene: "Interior",
              width: 1080,
              height: 1920,
            })}
            .mp4
          </p>
        </div>
      </Card>

      <Card title="Not yet available" description="These Brand Kit features are planned and not active in this build.">
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-xs">
          <li>Brand font upload (Milestone 2) — system fonts are used until then.</li>
          <li>Logo library (Milestone 2).</li>
          <li>Motion presets and easing defaults (Phase 3).</li>
        </ul>
      </Card>
    </div>
  );
}
