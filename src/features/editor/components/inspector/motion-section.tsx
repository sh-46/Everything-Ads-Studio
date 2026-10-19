"use client";

import { Play } from "lucide-react";
import { FieldRow, NumberField, Section, SelectField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { continuousDefaults } from "@/domain/brand-motion";
import {
  CONTINUOUS_LABELS,
  CONTINUOUS_PRESETS,
  DIRECTIONS,
  EASING_LABELS,
  EASINGS,
  ENTRANCE_LABELS,
  ENTRANCE_PRESETS,
  EXIT_LABELS,
  EXIT_PRESETS,
  SEQUENCING,
  SEQUENCING_LABELS,
  TRANSITION_LABELS,
  TRANSITION_PRESETS,
  type MotionConfig,
} from "@/domain/motion";
import { computeSceneTimings, supportsContinuous } from "@/domain/motion-engine";
import type { Layer } from "@/domain/scene";
import { useActiveScene, useEditorStore } from "../../store/editor-store";

const options = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

const DIRECTION_OPTIONS = DIRECTIONS.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }));

/** Seconds with up to two decimals for display. */
const sec = (ms: number) => Number((ms / 1000).toFixed(2));

function formatSeconds(ms: number): string {
  return Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)}s` : "—";
}

/**
 * Property-based motion controls (no keyframe timeline). Every change is an ordinary
 * layer update, so it autosaves, undoes, and shows up in the preview immediately.
 */
export function MotionSection({ layer }: { layer: Layer }) {
  const scene = useActiveScene();
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const playPreview = useEditorStore((s) => s.playPreview);
  const m = layer.motion;

  const set = <K extends keyof MotionConfig>(key: K, value: MotionConfig[K], field: string) =>
    updateLayer(layer.id, { motion: { ...m, [key]: value } }, `${layer.id}:motion.${field}`);
  const setPart = <K extends "entrance" | "continuous" | "transition" | "exit">(
    key: K,
    patch: Partial<MotionConfig[K]>,
    field: string,
  ) => set(key, { ...m[key], ...patch } as MotionConfig[K], `${key}.${field}`);

  const timing = scene
    ? computeSceneTimings(scene.document.layers, scene.document.durationMs).get(layer.id)
    : undefined;
  const isImage = layer.type === "image";
  const usesTransition = isImage && m.transition.preset !== "none";
  const isSlide = m.entrance.preset.startsWith("slide");

  return (
    <Section
      title="Motion"
      aside={
        <Button variant="ghost" size="xs" onClick={playPreview} data-testid="motion-preview">
          <Play /> Preview
        </Button>
      }
    >
      <div className="space-y-2" data-testid="motion-inspector">
        <SelectField
          label="Start"
          value={m.sequencing}
          options={options(SEQUENCING, SEQUENCING_LABELS)}
          onChange={(v) => set("sequencing", v, "sequencing")}
        />
        <NumberField
          label="Delay"
          suffix="s"
          min={0}
          max={60}
          step={0.1}
          precision={2}
          value={sec(m.delayMs)}
          onChange={(v) => set("delayMs", Math.round(v * 1000), "delay")}
        />
        {m.sequencing !== "sceneStart" && (
          <p className="text-muted-foreground text-[11px]">
            “Previous” is the next visible layer below in the Layers list.
          </p>
        )}
      </div>

      {isImage && (
        <div className="border-border space-y-2 border-t pt-2">
          <p className="text-[11px] font-medium">Two-image transition</p>
          <SelectField
            label="Type"
            value={m.transition.preset}
            options={options(TRANSITION_PRESETS, TRANSITION_LABELS)}
            onChange={(v) => setPart("transition", { preset: v }, "preset")}
          />
          {usesTransition && (
            <FieldRow>
              <NumberField
                label="Dur"
                suffix="s"
                min={0}
                max={20}
                step={0.1}
                precision={2}
                value={sec(m.transition.durationMs)}
                onChange={(v) => setPart("transition", { durationMs: Math.round(v * 1000) }, "duration")}
              />
              {m.transition.preset === "slide" ? (
                <SelectField
                  label="Dir"
                  value={m.transition.direction}
                  options={DIRECTION_OPTIONS}
                  onChange={(v) => setPart("transition", { direction: v }, "direction")}
                />
              ) : (
                <SelectField
                  label="Ease"
                  value={m.transition.easing}
                  options={options(EASINGS, EASING_LABELS)}
                  onChange={(v) => setPart("transition", { easing: v }, "easing")}
                />
              )}
            </FieldRow>
          )}
          <p className="text-muted-foreground text-[11px]">
            Use on the upper of two photos in the same frame; it appears over the photo below at its start time.
          </p>
        </div>
      )}

      {!usesTransition && (
        <div className="border-border space-y-2 border-t pt-2">
          <p className="text-[11px] font-medium">Entrance</p>
          <SelectField
            label="Type"
            value={m.entrance.preset}
            options={options(ENTRANCE_PRESETS, ENTRANCE_LABELS)}
            onChange={(v) => setPart("entrance", { preset: v }, "preset")}
          />
          {m.entrance.preset !== "none" && (
            <>
              <FieldRow>
                <NumberField
                  label="Dur"
                  suffix="s"
                  min={0}
                  max={20}
                  step={0.1}
                  precision={2}
                  value={sec(m.entrance.durationMs)}
                  onChange={(v) => setPart("entrance", { durationMs: Math.round(v * 1000) }, "duration")}
                />
                <SelectField
                  label="Ease"
                  value={m.entrance.easing}
                  options={options(EASINGS, EASING_LABELS)}
                  onChange={(v) => setPart("entrance", { easing: v }, "easing")}
                />
              </FieldRow>
              {isSlide && (
                <NumberField
                  label="Travel"
                  suffix="px"
                  min={0}
                  max={4000}
                  value={m.entrance.distance}
                  onChange={(v) => setPart("entrance", { distance: v }, "distance")}
                />
              )}
              {m.entrance.preset === "scaleIn" && (
                <NumberField
                  label="From"
                  suffix="%"
                  min={0}
                  max={1000}
                  value={Math.round(m.entrance.scaleStart * 100)}
                  onChange={(v) => setPart("entrance", { scaleStart: v / 100 }, "scaleStart")}
                />
              )}
            </>
          )}
        </div>
      )}

      {supportsContinuous(layer) && (
        <div className="border-border space-y-2 border-t pt-2">
          <p className="text-[11px] font-medium">Continuous image motion</p>
          <SelectField
            label="Type"
            value={m.continuous.preset}
            options={options(CONTINUOUS_PRESETS, CONTINUOUS_LABELS)}
            onChange={(v) => setPart("continuous", continuousDefaults(v), "preset")}
          />
          {m.continuous.preset !== "none" && (
            <>
              {m.continuous.preset.startsWith("slowZoom") ? (
                <FieldRow>
                  <NumberField
                    label="From"
                    suffix="%"
                    min={10}
                    max={1000}
                    value={Math.round(m.continuous.scaleStart * 100)}
                    onChange={(v) => setPart("continuous", { scaleStart: v / 100 }, "scaleStart")}
                  />
                  <NumberField
                    label="To"
                    suffix="%"
                    min={10}
                    max={1000}
                    value={Math.round(m.continuous.scaleEnd * 100)}
                    onChange={(v) => setPart("continuous", { scaleEnd: v / 100 }, "scaleEnd")}
                  />
                </FieldRow>
              ) : (
                <NumberField
                  label="Travel"
                  suffix="px"
                  min={0}
                  max={4000}
                  value={m.continuous.distance}
                  onChange={(v) => setPart("continuous", { distance: v }, "distance")}
                />
              )}
              <NumberField
                label="Over"
                suffix="s"
                min={0}
                max={120}
                step={0.5}
                precision={2}
                value={sec(m.continuous.durationMs)}
                onChange={(v) => setPart("continuous", { durationMs: Math.round(v * 1000) }, "duration")}
              />
              <p className="text-muted-foreground text-[11px]">0 s = until the end of the scene.</p>
            </>
          )}
        </div>
      )}

      <div className="border-border space-y-2 border-t pt-2">
        <p className="text-[11px] font-medium">Exit</p>
        <SelectField
          label="Type"
          value={m.exit.preset}
          options={options(EXIT_PRESETS, EXIT_LABELS)}
          onChange={(v) => setPart("exit", { preset: v }, "preset")}
        />
        {m.exit.preset !== "none" && (
          <>
            <FieldRow>
              <NumberField
                label="Dur"
                suffix="s"
                min={0}
                max={20}
                step={0.1}
                precision={2}
                value={sec(m.exit.durationMs)}
                onChange={(v) => setPart("exit", { durationMs: Math.round(v * 1000) }, "duration")}
              />
              <SelectField
                label="Ease"
                value={m.exit.easing}
                options={options(EASINGS, EASING_LABELS)}
                onChange={(v) => setPart("exit", { easing: v }, "easing")}
              />
            </FieldRow>
            {m.exit.preset === "slideOut" && (
              <FieldRow>
                <SelectField
                  label="Dir"
                  value={m.exit.direction}
                  options={DIRECTION_OPTIONS}
                  onChange={(v) => setPart("exit", { direction: v }, "direction")}
                />
                <NumberField
                  label="Travel"
                  suffix="px"
                  min={0}
                  max={4000}
                  value={m.exit.distance}
                  onChange={(v) => setPart("exit", { distance: v }, "distance")}
                />
              </FieldRow>
            )}
            <NumberField
              label="Hold"
              suffix="s"
              min={0}
              max={60}
              step={0.1}
              precision={2}
              value={sec(m.holdMs)}
              onChange={(v) => set("holdMs", Math.round(v * 1000), "hold")}
            />
            <p className="text-muted-foreground text-[11px]">Hold 0 s = exit finishes at the end of the scene.</p>
          </>
        )}
      </div>

      {timing && (
        <p
          className="text-muted-foreground border-border border-t pt-2 text-[11px] tabular-nums"
          data-testid="motion-timing"
        >
          Starts {formatSeconds(timing.start)} · in by {formatSeconds(timing.entranceEnd)}
          {Number.isFinite(timing.exitStart) &&
            ` · exits ${formatSeconds(timing.exitStart)}–${formatSeconds(timing.exitEnd)}`}
        </p>
      )}
    </Section>
  );
}
