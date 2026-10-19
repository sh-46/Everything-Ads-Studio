"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Eye,
  EyeOff,
  Lock,
  Minus,
  Plus,
  Unlock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useShallow } from "zustand/react/shallow";
import { brandFontsFromAssets, type Asset } from "@/domain/asset";
import { FONT_WEIGHTS, isSystemFont, SYSTEM_FONT_FAMILIES } from "@/domain/fonts";
import type { GradientLayer, ImageLayer, Layer, ShapeLayer, TextLayer } from "@/domain/scene";

function brandFamilyNames(assets: Asset[]): string[] {
  return [...new Set(brandFontsFromAssets(assets).map((f) => f.family))].sort();
}
import type { LayerPatch, SceneAlignment } from "../../store/layer-ops";
import { useEditorStore } from "../../store/editor-store";
import { DisclosureSection, VisibilitySection } from "./disclosure-section";
import { MediaSource } from "./media-source";
import { MotionSection } from "./motion-section";
import { ColorField, FieldRow, NumberField, RangeField, Section, SelectField } from "@/components/fields";

type Update = (patch: LayerPatch, field: string) => void;

const ALIGN_BUTTONS: { alignment: SceneAlignment; label: string; icon: React.ElementType }[] = [
  { alignment: "left", label: "Align left", icon: AlignStartVertical },
  { alignment: "centerX", label: "Align horizontal center", icon: AlignCenterVertical },
  { alignment: "right", label: "Align right", icon: AlignEndVertical },
  { alignment: "top", label: "Align top", icon: AlignStartHorizontal },
  { alignment: "centerY", label: "Align vertical center", icon: AlignCenterHorizontal },
  { alignment: "bottom", label: "Align bottom", icon: AlignEndHorizontal },
];

export function LayerInspector({ layer }: { layer: Layer }) {
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const alignLayer = useEditorStore((s) => s.alignLayer);
  const update: Update = (patch, field) => updateLayer(layer.id, patch, `${layer.id}:${field}`);

  return (
    <div>
      <Section
        title="Layer"
        aside={
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={layer.visible ? "Hide layer" : "Show layer"}
              onClick={() => update({ visible: !layer.visible }, "visible")}
            >
              {layer.visible ? <Eye /> : <EyeOff />}
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
              onClick={() => update({ locked: !layer.locked }, "locked")}
            >
              {layer.locked ? <Lock /> : <Unlock />}
            </Button>
          </div>
        }
      >
        <input
          aria-label="Layer name"
          className="border-input focus-visible:border-ring h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none"
          value={layer.name}
          maxLength={80}
          onChange={(e) => e.target.value.trim() && update({ name: e.target.value }, "name")}
        />
      </Section>

      <Section title="Position & size">
        <FieldRow>
          <NumberField label="X" value={layer.x} onChange={(x) => update({ x }, "x")} />
          <NumberField label="Y" value={layer.y} onChange={(y) => update({ y }, "y")} />
          <NumberField label="W" min={1} value={layer.width} onChange={(width) => update({ width }, "width")} />
          <NumberField label="H" min={1} value={layer.height} onChange={(height) => update({ height }, "height")} />
          <NumberField
            label="Rot"
            suffix="°"
            min={-360}
            max={360}
            precision={1}
            value={layer.rotation}
            onChange={(rotation) => update({ rotation }, "rotation")}
          />
          <NumberField
            label="Opac"
            suffix="%"
            min={0}
            max={100}
            value={Math.round(layer.opacity * 100)}
            onChange={(v) => update({ opacity: v / 100 }, "opacity")}
          />
        </FieldRow>
        <div className="flex justify-between pt-1">
          {ALIGN_BUTTONS.map(({ alignment, label, icon: Icon }) => (
            <Button
              key={alignment}
              variant="ghost"
              size="icon-xs"
              aria-label={label}
              title={label}
              onClick={() => alignLayer(layer.id, alignment)}
            >
              <Icon />
            </Button>
          ))}
        </div>
      </Section>

      {layer.type === "text" && <TextSection layer={layer} update={update} />}
      {layer.type === "image" && <ImageSection layer={layer} update={update} />}
      {layer.type === "gradient" && <GradientSection layer={layer} update={update} />}
      {layer.type === "shape" && <ShapeSection layer={layer} update={update} />}
      {layer.type === "logo" && (
        <MediaSource layer={layer}>
          <p className="text-muted-foreground text-[11px]">Logos always keep their aspect ratio inside the frame.</p>
        </MediaSource>
      )}

      <VisibilitySection layer={layer} />
      <MotionSection layer={layer} />
    </div>
  );
}

function TextSection({ layer, update }: { layer: TextLayer; update: Update }) {
  const kit = useEditorStore((s) => s.kit);
  const fontStatus = useEditorStore((s) => s.fontStatus);
  const brandFamilies = useEditorStore(useShallow((s) => brandFamilyNames(s.assets)));
  const fontOptions = [
    ...brandFamilies.map((f) => ({ value: f, label: `${f} · Brand${fontStatus[f] === "error" ? " (failed)" : ""}` })),
    ...SYSTEM_FONT_FAMILIES.filter((f) => !brandFamilies.includes(f)).map((f) => ({ value: f, label: f })),
  ];
  const known = brandFamilies.includes(layer.fontFamily) || isSystemFont(layer.fontFamily);
  if (!fontOptions.some((o) => o.value === layer.fontFamily)) {
    fontOptions.unshift({ value: layer.fontFamily, label: `${layer.fontFamily} (missing)` });
  }
  const fontWarning = !known
    ? "This font isn’t in the Brand Kit or system list, so a fallback font is shown. Upload it in the Brand Kit or pick another."
    : fontStatus[layer.fontFamily] === "error"
      ? "The font file failed to load; a fallback font is shown."
      : fontStatus[layer.fontFamily] === "loading"
        ? "Loading font…"
        : null;
  const resetToBrand = () => {
    if (!layer.styleRef) return;
    const style = kit.typography[layer.styleRef];
    update({ ...style }, "reset-style");
  };
  return (
    <>
      {layer.disclosure ? (
        <DisclosureSection layer={layer} />
      ) : (
        <Section title="Text">
          <Textarea
            id="inspector-text-content"
            aria-label="Text content"
            className="min-h-20 text-xs"
            value={layer.text}
            onChange={(e) => update({ text: e.target.value }, "text")}
          />
        </Section>
      )}
      <Section
        title="Typography"
        aside={
          layer.styleRef && (
            <Button variant="ghost" size="xs" onClick={resetToBrand} title={`Reset to brand ${layer.styleRef} style`}>
              Reset to brand
            </Button>
          )
        }
      >
        <SelectField
          label="Font"
          value={layer.fontFamily}
          options={fontOptions}
          onChange={(fontFamily) => update({ fontFamily }, "fontFamily")}
        />
        {fontWarning && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400" role="status" data-testid="font-warning">
            {fontWarning}
          </p>
        )}
        <FieldRow>
          <NumberField
            label="Size"
            min={4}
            max={1000}
            value={layer.fontSize}
            onChange={(fontSize) => update({ fontSize }, "fontSize")}
          />
          <SelectField
            label="Wt"
            value={String(layer.fontWeight)}
            options={FONT_WEIGHTS.map((w) => ({ value: String(w), label: String(w) }))}
            onChange={(v) => update({ fontWeight: Number(v) }, "fontWeight")}
          />
          <NumberField
            label="Track"
            min={-50}
            max={200}
            step={0.5}
            precision={1}
            value={layer.letterSpacing}
            onChange={(letterSpacing) => update({ letterSpacing }, "letterSpacing")}
          />
          <NumberField
            label="Lead"
            min={0.5}
            max={4}
            step={0.05}
            precision={2}
            value={layer.lineHeight}
            onChange={(lineHeight) => update({ lineHeight }, "lineHeight")}
          />
        </FieldRow>
        <ColorField label="Color" value={layer.color} onChange={(color) => update({ color }, "color")} />
        <SelectField
          label="Align"
          value={layer.align}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
          onChange={(align) => update({ align }, "align")}
        />
      </Section>
    </>
  );
}

function ImageSection({ layer, update }: { layer: ImageLayer; update: Update }) {
  return (
    <MediaSource layer={layer} title="Image framing">
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        Static crop of the photo in its frame — it doesn’t animate. For animated zoom or pan, use Camera motion below.
      </p>
      <SelectField
        wide
        label="Fit"
        value={layer.fit}
        options={[
          { value: "cover", label: "Cover (crop)" },
          { value: "contain", label: "Contain" },
          { value: "fill", label: "Stretch" },
        ]}
        onChange={(fit) => update({ fit }, "fit")}
      />
      <RangeField
        wide
        label="Static zoom"
        min={1}
        max={5}
        step={0.01}
        value={layer.zoom}
        onChange={(zoom) => update({ zoom }, "zoom")}
        format={(v) => `${v.toFixed(2)}×`}
      />
      <RangeField
        wide
        label="Pan X"
        min={0}
        max={1}
        step={0.01}
        value={layer.focalX}
        onChange={(focalX) => update({ focalX }, "focalX")}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <RangeField
        wide
        label="Pan Y"
        min={0}
        max={1}
        step={0.01}
        value={layer.focalY}
        onChange={(focalY) => update({ focalY }, "focalY")}
        format={(v) => `${Math.round(v * 100)}%`}
      />
    </MediaSource>
  );
}

function GradientSection({ layer, update }: { layer: GradientLayer; update: Update }) {
  const fill = layer.fill;
  const setFill = (patch: Partial<GradientLayer["fill"]>, field: string) =>
    update({ fill: { ...fill, ...patch } }, `fill.${field}`);
  const setStop = (index: number, patch: Partial<GradientLayer["fill"]["stops"][number]>, field: string) =>
    setFill({ stops: fill.stops.map((s, i) => (i === index ? { ...s, ...patch } : s)) }, `stop${index}.${field}`);

  return (
    <Section title="Gradient">
      <FieldRow>
        <SelectField
          label="Type"
          value={fill.gradientType}
          options={[
            { value: "linear", label: "Linear" },
            { value: "radial", label: "Radial" },
          ]}
          onChange={(gradientType) => setFill({ gradientType }, "type")}
        />
        <NumberField
          label="Angle"
          suffix="°"
          min={-360}
          max={360}
          value={fill.angle}
          disabled={fill.gradientType === "radial"}
          onChange={(angle) => setFill({ angle }, "angle")}
        />
      </FieldRow>
      {fill.stops.map((stop, index) => (
        <div key={index} className="border-border space-y-1.5 rounded-md border p-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px]">Stop {index + 1}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove stop ${index + 1}`}
              disabled={fill.stops.length <= 2}
              onClick={() => setFill({ stops: fill.stops.filter((_, i) => i !== index) }, "remove")}
            >
              <Minus />
            </Button>
          </div>
          <ColorField label="Color" value={stop.color} onChange={(color) => setStop(index, { color }, "color")} />
          <RangeField
            label="Opac"
            min={0}
            max={1}
            step={0.01}
            value={stop.opacity}
            onChange={(opacity) => setStop(index, { opacity }, "opacity")}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <RangeField
            label="Pos"
            min={0}
            max={1}
            step={0.01}
            value={stop.offset}
            onChange={(offset) => setStop(index, { offset }, "offset")}
            format={(v) => `${Math.round(v * 100)}%`}
          />
        </div>
      ))}
      <Button
        variant="outline"
        size="xs"
        className="w-full"
        disabled={fill.stops.length >= 8}
        onClick={() => {
          const last = fill.stops[fill.stops.length - 1];
          setFill({ stops: [...fill.stops, { ...last, offset: 1 }] }, "add");
        }}
      >
        <Plus /> Add stop
      </Button>
    </Section>
  );
}

function ShapeSection({ layer, update }: { layer: ShapeLayer; update: Update }) {
  return (
    <Section title="Shape">
      <SelectField
        label="Type"
        value={layer.shape}
        options={[
          { value: "rect", label: "Rectangle" },
          { value: "ellipse", label: "Ellipse" },
        ]}
        onChange={(shape) => update({ shape }, "shape")}
      />
      <ColorField label="Fill" value={layer.fill} onChange={(fill) => update({ fill }, "fill")} />
      {layer.shape === "rect" && (
        <NumberField
          label="Radius"
          min={0}
          max={2000}
          value={layer.cornerRadius}
          onChange={(cornerRadius) => update({ cornerRadius }, "cornerRadius")}
        />
      )}
    </Section>
  );
}
