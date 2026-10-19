"use client";

import { ArrowRight, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "cn";
import { FieldRow, NumberField, Section, SelectField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { assetLabel } from "@/domain/asset";
import { continuousDefaults, sectionDefaults } from "@/domain/brand-motion";
import {
  CONTINUOUS_LABELS,
  CONTINUOUS_PRESETS,
  DIRECTIONS,
  entranceLabel,
  ENTRANCE_MOVES,
  EXIT_LABELS,
  EXIT_PRESETS,
  MOVE_LABELS,
  SEQUENCING,
  SEQUENCING_LABELS,
  TRANSITION_LABELS,
  TRANSITION_PRESETS,
  type MotionConfig,
} from "@/domain/motion";
import { cameraCoverage, computeSceneTimings, supportsContinuous, type LayerTiming } from "@/domain/motion-engine";
import type { ImageLayer, Layer } from "@/domain/scene";
import { assignScenePhoto, photoPair } from "@/domain/scene-photos";
import { AssetPickerDialog, AssetThumb } from "@/features/assets/components/asset-picker-dialog";
import type { UploadTarget } from "@/features/assets/upload";
import { useActiveScene, useEditorStore } from "../../store/editor-store";
import { EasingField, Hint, MotionGroup, TimingOverview } from "./motion-parts";
import { MotionPresetsMenu } from "./motion-presets-menu";

const sec = (ms: number) => Number((ms / 1000).toFixed(2));
const toMs = (seconds: number) => Math.round(seconds * 1000);
const DIRECTION_OPTIONS = DIRECTIONS.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }));

/** While previewing, replay the edited layer shortly after its settings change. */
let replayTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReplay(layerId: string) {
  const { canvasMode, playLayer } = useEditorStore.getState();
  if (canvasMode !== "preview") return;
  if (replayTimer) clearTimeout(replayTimer);
  replayTimer = setTimeout(() => playLayer(layerId), 450);
}

/**
 * Property-based motion controls (no keyframe timeline). Every change is a normal layer
 * update: it autosaves, supports undo/redo, and the Remotion preview re-renders it.
 */
export function MotionSection({ layer }: { layer: Layer }) {
  const scene = useActiveScene();
  const kit = useEditorStore((s) => s.kit);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const playLayer = useEditorStore((s) => s.playLayer);
  const m = layer.motion;
  const doc = scene?.document;

  const timings = useMemo(
    () => (doc ? computeSceneTimings(doc.layers, doc.durationMs) : new Map<string, LayerTiming>()),
    [doc],
  );
  const pair = useMemo(() => (doc ? photoPair(doc) : {}), [doc]);
  const defaults = sectionDefaults(kit, layer.type);
  const isPhoto1 = layer.type === "image" && pair.photo1?.id === layer.id;
  const isPhoto2 = layer.type === "image" && pair.photo2?.id === layer.id;
  const photo2Uses = pair.photo2 && pair.photo2.motion.transition.preset !== "none";

  /** Update motion of `target` (defaults to the selected layer). */
  const setMotion = (patch: Partial<MotionConfig>, field: string, target: Layer = layer) => {
    updateLayer(target.id, { motion: { ...target.motion, ...patch } }, `${target.id}:motion.${field}`);
    scheduleReplay(target.id);
  };
  const setPart = <K extends "entrance" | "continuous" | "transition" | "exit">(
    key: K,
    patch: Partial<MotionConfig[K]>,
    field: string,
    target: Layer = layer,
  ) => setMotion({ [key]: { ...target.motion[key], ...patch } } as Partial<MotionConfig>, `${key}.${field}`, target);

  if (!doc) return null;
  const timing = timings.get(layer.id);
  const photo2Timing = pair.photo2 ? timings.get(pair.photo2.id) : undefined;
  const transitionWindow =
    (isPhoto1 || isPhoto2) && pair.photo2 && photo2Timing
      ? { from: photo2Timing.start, to: photo2Timing.entranceEnd }
      : null;

  return (
    <Section
      title="Motion"
      aside={
        <div className="flex items-center gap-0.5">
          <MotionPresetsMenu layer={layer} />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => playLayer(layer.id)}
            data-testid="motion-replay"
            title="Play this layer’s animation in the preview"
          >
            <Play /> Replay
          </Button>
        </div>
      }
    >
      <div className="space-y-2" data-testid="motion-inspector">
        <SelectField
          wide
          label="Starts"
          value={m.sequencing}
          options={SEQUENCING.map((v) => ({ value: v, label: SEQUENCING_LABELS[v] }))}
          onChange={(v) => setMotion({ sequencing: v }, "sequencing")}
        />
        <NumberField
          wide
          label="Delay"
          suffix="s"
          min={0}
          max={60}
          step={0.1}
          precision={2}
          value={sec(m.delayMs)}
          onChange={(v) => setMotion({ delayMs: toMs(v) }, "delay")}
        />
        {m.sequencing !== "sceneStart" && (
          <Hint>“Previous layer” is the next visible layer below this one in the Layers list.</Hint>
        )}
      </div>

      {isPhoto2 && photo2Uses ? (
        <div className="border-border border-t pt-2">
          <Hint>This photo enters with the Photo 1 → Photo 2 transition below.</Hint>
        </div>
      ) : (
        <MotionGroup
          id="entrance"
          title="Entrance"
          summary={`${entranceLabel(m.entrance)}${m.entrance.fade || m.entrance.move !== "none" ? ` · ${sec(m.entrance.durationMs)}s` : ""}`}
          onReset={() => setMotion({ entrance: defaults.entrance }, "entrance.reset")}
        >
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={m.entrance.fade}
              onChange={(e) => setPart("entrance", { fade: e.target.checked }, "fade")}
              data-testid="entrance-fade"
            />
            Fade in
          </label>
          <SelectField
            wide
            label="Movement"
            value={m.entrance.move}
            options={ENTRANCE_MOVES.map((v) => ({ value: v, label: MOVE_LABELS[v] }))}
            onChange={(v) => setPart("entrance", { move: v }, "move")}
          />
          {m.entrance.fade || m.entrance.move !== "none" ? (
            <>
              {m.entrance.move.startsWith("slide") && (
                <NumberField
                  wide
                  label="Travel"
                  suffix="px"
                  min={0}
                  max={4000}
                  value={m.entrance.distance}
                  onChange={(v) => setPart("entrance", { distance: v }, "distance")}
                />
              )}
              {m.entrance.move === "scaleIn" && (
                <NumberField
                  wide
                  label="From scale"
                  suffix="%"
                  min={0}
                  max={1000}
                  value={Math.round(m.entrance.scaleStart * 100)}
                  onChange={(v) => setPart("entrance", { scaleStart: v / 100 }, "scaleStart")}
                />
              )}
              <NumberField
                wide
                label="Duration"
                suffix="s"
                min={0}
                max={20}
                step={0.1}
                precision={2}
                value={sec(m.entrance.durationMs)}
                onChange={(v) => setPart("entrance", { durationMs: toMs(v) }, "duration")}
              />
              <EasingField value={m.entrance.easing} onChange={(v) => setPart("entrance", { easing: v }, "easing")} />
            </>
          ) : (
            <Hint>No entrance: the layer appears instantly at its start time.</Hint>
          )}
        </MotionGroup>
      )}

      {supportsContinuous(layer) && (
        <CameraMotion
          layer={layer}
          timing={timing}
          onReset={() => setMotion({ continuous: defaults.continuous }, "continuous.reset")}
          setPart={setPart}
        />
      )}

      {layer.type === "image" && (isPhoto1 || isPhoto2) && (
        <PhotoTransition
          photo1={pair.photo1!}
          photo2={pair.photo2}
          timing={photo2Timing}
          setPart={setPart}
          setMotion={setMotion}
          onReset={() => pair.photo2 && setMotion({ transition: defaults.transition }, "transition.reset", pair.photo2)}
        />
      )}

      <MotionGroup
        id="exit"
        title="Exit"
        summary={m.exit.preset === "none" ? "None" : `${EXIT_LABELS[m.exit.preset]} · ${sec(m.exit.durationMs)}s`}
        defaultOpen={false}
        onReset={() => setMotion({ exit: defaults.exit, holdMs: defaults.holdMs }, "exit.reset")}
      >
        <SelectField
          wide
          label="Type"
          value={m.exit.preset}
          options={EXIT_PRESETS.map((v) => ({ value: v, label: EXIT_LABELS[v] }))}
          onChange={(v) => setPart("exit", { preset: v }, "preset")}
        />
        {m.exit.preset === "none" ? (
          <Hint>The layer stays on screen until the scene ends.</Hint>
        ) : (
          <>
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
              wide
              label="Duration"
              suffix="s"
              min={0}
              max={20}
              step={0.1}
              precision={2}
              value={sec(m.exit.durationMs)}
              onChange={(v) => setPart("exit", { durationMs: toMs(v) }, "duration")}
            />
            <EasingField value={m.exit.easing} onChange={(v) => setPart("exit", { easing: v }, "easing")} />
            <NumberField
              wide
              label="Hold"
              suffix="s"
              min={0}
              max={60}
              step={0.1}
              precision={2}
              value={sec(m.holdMs)}
              onChange={(v) => setMotion({ holdMs: toMs(v) }, "hold")}
            />
            <Hint>Hold = time on screen after the entrance. 0 s = exit so it finishes at the scene end.</Hint>
          </>
        )}
      </MotionGroup>

      <MotionGroup id="timing" title="Timing overview" summary={`scene ${sec(doc.durationMs)}s`}>
        <TimingOverview layer={layer} timing={timing} sceneDurationMs={doc.durationMs} transition={transitionWindow} />
      </MotionGroup>
    </Section>
  );
}

type SetPart = <K extends "entrance" | "continuous" | "transition" | "exit">(
  key: K,
  patch: Partial<MotionConfig[K]>,
  field: string,
  target?: Layer,
) => void;

function CameraMotion({
  layer,
  timing,
  setPart,
  onReset,
}: {
  layer: Layer;
  timing: LayerTiming | undefined;
  setPart: SetPart;
  onReset: () => void;
}) {
  const assets = useEditorStore((s) => s.assets);
  const c = layer.motion.continuous;
  const isZoom = c.preset === "slowZoomIn" || c.preset === "slowZoomOut";
  const media =
    layer.type === "image" || layer.type === "logo" ? assets.find((a) => a.id === layer.assetId) : undefined;
  const coverage =
    layer.type === "image" && c.preset !== "none"
      ? cameraCoverage(
          layer,
          media?.width && media.height ? { width: media.width, height: media.height } : null,
          timing,
        )
      : { covered: true, minScaleNeeded: 1 };
  const containFit = layer.type === "image" && layer.fit === "contain" && c.preset !== "none";

  const fixEdges = () => {
    const k = coverage.minScaleNeeded * 1.002;
    setPart(
      "continuous",
      { scaleStart: Number((c.scaleStart * k).toFixed(3)), scaleEnd: Number((c.scaleEnd * k).toFixed(3)) },
      "fix",
    );
  };

  return (
    <MotionGroup
      id="camera"
      title="Camera motion"
      summary={c.preset === "none" ? "None" : CONTINUOUS_LABELS[c.preset]}
      onReset={onReset}
    >
      <SelectField
        wide
        label="Type"
        value={c.preset}
        options={CONTINUOUS_PRESETS.map((v) => ({ value: v, label: CONTINUOUS_LABELS[v] }))}
        onChange={(v) => setPart("continuous", continuousDefaults(v), "preset")}
      />
      {c.preset === "none" ? (
        <Hint>Animated zoom or pan of the photo inside its frame. Static framing is set under Image Framing.</Hint>
      ) : (
        <>
          {isZoom ? (
            <FieldRow>
              <NumberField
                label="From"
                suffix="%"
                min={10}
                max={1000}
                value={Math.round(c.scaleStart * 100)}
                onChange={(v) => setPart("continuous", { scaleStart: v / 100 }, "scaleStart")}
              />
              <NumberField
                label="To"
                suffix="%"
                min={10}
                max={1000}
                value={Math.round(c.scaleEnd * 100)}
                onChange={(v) => setPart("continuous", { scaleEnd: v / 100 }, "scaleEnd")}
              />
            </FieldRow>
          ) : (
            <NumberField
              wide
              label="Travel"
              suffix="px"
              min={0}
              max={4000}
              value={c.distance}
              onChange={(v) => setPart("continuous", { distance: v }, "distance")}
            />
          )}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={c.durationMs === 0}
              onChange={(e) => setPart("continuous", { durationMs: e.target.checked ? 0 : 6000 }, "wholeScene")}
              data-testid="camera-whole-scene"
            />
            Run until the end of the scene
          </label>
          {c.durationMs > 0 && (
            <NumberField
              wide
              label="Duration"
              suffix="s"
              min={0.1}
              max={120}
              step={0.5}
              precision={2}
              value={sec(c.durationMs)}
              onChange={(v) => setPart("continuous", { durationMs: toMs(v) }, "duration")}
            />
          )}
          <EasingField value={c.easing} onChange={(v) => setPart("continuous", { easing: v }, "easing")} />
          {containFit && (
            <Hint tone="warn">
              This photo uses Contain framing, so its edges are always visible. Use Cover to fill the frame.
            </Hint>
          )}
          {!containFit && !coverage.covered && (
            <div className="flex items-start gap-2" data-testid="camera-edge-warning">
              <Hint tone="warn">
                Blank edges will show during this motion. Zoom must stay at or above{" "}
                {Math.round(coverage.minScaleNeeded * Math.min(c.scaleStart, c.scaleEnd) * 100)}% to cover the frame.
              </Hint>
              <Button variant="outline" size="xs" onClick={fixEdges} className="shrink-0">
                Fix
              </Button>
            </div>
          )}
        </>
      )}
    </MotionGroup>
  );
}

function PhotoThumb({ layer, role }: { layer: ImageLayer; role: string }) {
  const assets = useEditorStore((s) => s.assets);
  const selectLayer = useEditorStore((s) => s.selectLayer);
  const selectedId = useEditorStore((s) => s.selectedLayerId);
  const asset = assets.find((a) => a.id === layer.assetId);
  return (
    <button
      type="button"
      onClick={() => selectLayer(layer.id)}
      title={`Select ${layer.name}`}
      className={cn(
        "min-w-0 flex-1 rounded-md border p-1 text-left",
        selectedId === layer.id ? "border-primary ring-primary/40 ring-1" : "border-border hover:bg-muted",
      )}
    >
      <div className="bg-muted aspect-[4/3] overflow-hidden rounded">{asset && <AssetThumb asset={asset} />}</div>
      <p className="mt-1 truncate text-[10px] font-medium">{role}</p>
      <p className="text-muted-foreground truncate text-[10px]">{asset ? assetLabel(asset) : "No photo"}</p>
    </button>
  );
}

function PhotoTransition({
  photo1,
  photo2,
  timing,
  setPart,
  setMotion,
  onReset,
}: {
  photo1: ImageLayer;
  photo2?: ImageLayer;
  timing: { start: number; entranceEnd: number } | undefined;
  setPart: SetPart;
  setMotion: (patch: Partial<MotionConfig>, field: string, target?: Layer) => void;
  onReset: () => void;
}) {
  const assets = useEditorStore((s) => s.assets);
  const addAsset = useEditorStore((s) => s.addAsset);
  const kit = useEditorStore((s) => s.kit);
  const target = useEditorStore((s) => s.uploadTarget) as UploadTarget;
  const mutateScene = useEditorStore((s) => s.mutateScene);
  const activeSceneId = useEditorStore((s) => s.activeSceneId);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!photo2) {
    return (
      <MotionGroup id="transition" title="Photo transition" summary="Needs a second photo">
        <Hint>
          This frame has one photo. Add a second photo to show Photo 1, then transition to Photo 2 (crossfade, slide or
          zoom).
        </Hint>
        <Button
          variant="outline"
          size="xs"
          className="w-full"
          onClick={() => setPickerOpen(true)}
          data-testid="add-second-photo"
        >
          Add second photo…
        </Button>
        <AssetPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          kind="photo"
          title="Add second photo"
          description="Photo 2 uses the same frame and crossfades in over Photo 1 mid-scene. You can change the transition after."
          assets={assets}
          target={target}
          onUploaded={(uploaded) => uploaded.forEach(addAsset)}
          onPick={(asset) =>
            mutateScene(activeSceneId, (s) => ({ ...s, document: assignScenePhoto(s.document, 2, asset.id, kit) }))
          }
          pickLabel="Add as Photo 2"
        />
      </MotionGroup>
    );
  }

  const t = photo2.motion.transition;
  const startMs = timing?.start ?? photo2.motion.delayMs;
  return (
    <MotionGroup
      id="transition"
      title="Photo transition"
      summary={`${TRANSITION_LABELS[t.preset]} at ${sec(startMs)}s`}
      onReset={onReset}
    >
      <div className="flex items-center gap-1.5" data-testid="photo-pair">
        <PhotoThumb layer={photo1} role="Photo 1 · outgoing" />
        <ArrowRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <PhotoThumb layer={photo2} role="Photo 2 · incoming" />
      </div>
      <SelectField
        wide
        label="Transition"
        value={t.preset}
        options={TRANSITION_PRESETS.map((v) => ({ value: v, label: TRANSITION_LABELS[v] }))}
        onChange={(v) => setPart("transition", { preset: v }, "preset", photo2)}
      />
      <NumberField
        wide
        label="Starts at"
        suffix="s"
        min={0}
        max={120}
        step={0.1}
        precision={2}
        value={sec(startMs)}
        onChange={(v) => setMotion({ sequencing: "sceneStart", delayMs: toMs(v) }, "transition.start", photo2)}
      />
      {t.preset !== "none" && (
        <>
          <NumberField
            wide
            label="Duration"
            suffix="s"
            min={0}
            max={20}
            step={0.1}
            precision={2}
            value={sec(t.durationMs)}
            onChange={(v) => setPart("transition", { durationMs: toMs(v) }, "duration", photo2)}
          />
          <EasingField value={t.easing} onChange={(v) => setPart("transition", { easing: v }, "easing", photo2)} />
          {t.preset === "slide" && (
            <SelectField
              wide
              label="Moves"
              value={t.direction}
              options={DIRECTION_OPTIONS}
              onChange={(v) => setPart("transition", { direction: v }, "direction", photo2)}
            />
          )}
        </>
      )}
      <Hint>
        {t.preset === "none"
          ? "Photo 2 replaces Photo 1 instantly at the start time."
          : t.preset === "slide"
            ? `Photo 2 slides in moving ${t.direction}, covering Photo 1.`
            : t.preset === "zoom"
              ? "Photo 2 fades in while settling from a slight zoom."
              : "Photo 2 fades in over Photo 1."}
      </Hint>
    </MotionGroup>
  );
}
