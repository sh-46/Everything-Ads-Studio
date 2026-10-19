"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LAYOUT_PRESETS, type LayoutPresetId } from "@/domain/layout-presets";
import { DEFAULT_SCENE_DURATION_MS, DIMENSION_PRESETS, DURATION_PRESETS_MS } from "@/domain/scene-templates";
import { useDisclosureIssues } from "../../hooks/use-disclosure-issues";
import { IssueRow } from "./disclosure-section";
import { useActiveScene, useEditorStore, type EditorScene } from "../../store/editor-store";
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
      </Section>

      <Section title="Duration">
        <NumberField
          wide
          label="Length"
          suffix="s"
          min={0.5}
          max={120}
          step={0.5}
          precision={1}
          value={doc.durationMs / 1000}
          onChange={(seconds) => updateDocument({ durationMs: Math.round(seconds * 1000) }, "scene-duration")}
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Duration presets">
          {DURATION_PRESETS_MS.map((ms) => (
            <Button
              key={ms}
              variant={doc.durationMs === ms ? "secondary" : "outline"}
              size="xs"
              onClick={() => updateDocument({ durationMs: ms })}
              data-testid={`duration-${ms / 1000}`}
            >
              {ms / 1000}s
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-[11px] leading-relaxed">
          Each scene has its own length; its export uses exactly this duration. New Motion Tiles start at{" "}
          {DEFAULT_SCENE_DURATION_MS.feed / 1000}s and Facebook Build scenes at {DEFAULT_SCENE_DURATION_MS.intro / 1000}
          s. Exits “at scene end” and full-length camera motion follow the new length.
        </p>
      </Section>

      <SceneDisclosureReview />

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

/** Disclosure review for the whole scene (shown when no layer is selected). */
function SceneDisclosureReview() {
  const issues = useDisclosureIssues();
  const scene = useActiveScene();
  const count = scene?.document.layers.filter((l) => l.type === "text" && l.disclosure).length ?? 0;
  if (issues.length === 0 && count === 0) return null;
  return (
    <Section title="Disclosures">
      {issues.length === 0 ? (
        <p className="text-muted-foreground text-[11px]" data-testid="scene-disclosures-ok">
          {count} {count === 1 ? "disclosure" : "disclosures"} · all checks pass (present, visible, readable, in the
          safe area).
        </p>
      ) : (
        <ul className="space-y-1" data-testid="scene-disclosure-issues">
          {issues.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
        </ul>
      )}
    </Section>
  );
}
