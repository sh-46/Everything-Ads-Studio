"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LAYOUT_PRESETS, type LayoutPresetId } from "@/domain/layout-presets";
import { DIMENSION_PRESETS } from "@/domain/scene-templates";
import { useEditorStore, type EditorScene } from "../../store/editor-store";
import { ColorField, FieldRow, NumberField, Section, SelectField } from "@/components/fields";

export function SceneInspector({ scene }: { scene: EditorScene }) {
  const updateDocument = useEditorStore((s) => s.updateDocument);
  const renameScene = useEditorStore((s) => s.renameScene);
  const applyLayout = useEditorStore((s) => s.applyLayout);
  const doc = scene.document;
  const [layout, setLayout] = useState<LayoutPresetId>(
    (doc.layout as LayoutPresetId | undefined) ?? "fullBleedOverlay",
  );
  const [nameDraft, setNameDraft] = useState(scene.name);

  const matchingPreset = DIMENSION_PRESETS.find((p) => p.width === doc.width && p.height === doc.height);

  return (
    <div>
      <Section title="Scene">
        <input
          aria-label="Scene name"
          className="border-input focus-visible:border-ring h-7 w-full rounded-md border bg-transparent px-2 text-xs outline-none"
          value={nameDraft}
          maxLength={120}
          onChange={(e) => {
            setNameDraft(e.target.value);
            renameScene(e.target.value);
          }}
          onBlur={() => setNameDraft(scene.name)}
        />
      </Section>

      <Section title="Dimensions">
        <SelectField
          label="Preset"
          value={matchingPreset?.id ?? "custom"}
          options={[
            ...DIMENSION_PRESETS.map((p) => ({ value: p.id, label: `${p.name} · ${p.width}×${p.height}` })),
            ...(matchingPreset ? [] : [{ value: "custom" as const, label: `Custom · ${doc.width}×${doc.height}` }]),
          ]}
          onChange={(id) => {
            const preset = DIMENSION_PRESETS.find((p) => p.id === id);
            if (preset) updateDocument({ width: preset.width, height: preset.height });
          }}
        />
        <FieldRow>
          <NumberField
            label="W"
            min={16}
            max={4096}
            value={doc.width}
            onChange={(width) => updateDocument({ width: Math.round(width) }, "scene-width")}
          />
          <NumberField
            label="H"
            min={16}
            max={4096}
            value={doc.height}
            onChange={(height) => updateDocument({ height: Math.round(height) }, "scene-height")}
          />
        </FieldRow>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Changing size keeps layer positions. Re-apply a layout to reflow.
        </p>
      </Section>

      <Section title="Appearance">
        <ColorField
          label="Fill"
          value={doc.background}
          onChange={(background) => updateDocument({ background }, "scene-background")}
        />
        <NumberField
          label="Dur"
          suffix="s"
          min={0.5}
          max={120}
          step={0.5}
          precision={1}
          value={doc.durationMs / 1000}
          onChange={(seconds) => updateDocument({ durationMs: Math.round(seconds * 1000) }, "scene-duration")}
        />
      </Section>

      <Section title="Layout">
        <SelectField
          label="Preset"
          value={layout}
          options={LAYOUT_PRESETS.map((p) => ({ value: p.id, label: p.name }))}
          onChange={setLayout}
        />
        <Button variant="outline" size="xs" className="w-full" onClick={() => applyLayout(layout)}>
          Apply layout
        </Button>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Keeps your photos, copy and typography; repositions them using brand defaults. Undo restores the previous
          layout.
        </p>
      </Section>
    </div>
  );
}
