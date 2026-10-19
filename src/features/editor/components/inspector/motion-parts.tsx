"use client";

import { ChevronRight, RotateCcw } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { SelectField } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { EASING_LABELS, EASINGS, type Easing } from "@/domain/motion";
import { ease, timingIssues, type LayerTiming } from "@/domain/motion-engine";
import type { Layer } from "@/domain/scene";

/** Plot of the actual easing function used by the engine (not a decorative icon). */
export function EasingCurve({ easing, className }: { easing: Easing; className?: string }) {
  const w = 44;
  const h = 28;
  const pad = 4;
  // Leave headroom for Spring overshoot.
  const y = (v: number) => h - pad - v * (h - pad * 2) * 0.82;
  const points = Array.from({ length: 33 }, (_, i) => {
    const t = i / 32;
    return `${(pad + t * (w - pad * 2)).toFixed(2)},${y(ease(easing, t)).toFixed(2)}`;
  });
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={cn("border-border bg-muted/50 shrink-0 rounded border", className)}
      role="img"
      aria-label={`${EASING_LABELS[easing]} curve`}
      data-testid="easing-curve"
      data-easing={easing}
    >
      <line x1={pad} y1={y(1)} x2={w - pad} y2={y(1)} className="stroke-border" strokeDasharray="2 2" />
      <polyline points={points.join(" ")} fill="none" className="stroke-foreground" strokeWidth={1.5} />
    </svg>
  );
}

export function EasingField({
  value,
  onChange,
  label = "Ease",
}: {
  value: Easing;
  onChange: (value: Easing) => void;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        {/* Narrow label so the full easing name fits beside the curve. */}
        <SelectField
          label={label}
          value={value}
          options={EASINGS.map((e) => ({ value: e, label: EASING_LABELS[e] }))}
          onChange={onChange}
        />
      </div>
      <EasingCurve easing={value} />
    </div>
  );
}

/** Open/closed state survives switching layers, so the inspector doesn't jump around. */
const openGroups = new Map<string, boolean>();

export function MotionGroup({
  id,
  title,
  summary,
  onReset,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  /** Shown in the header (e.g. "Fade In + Slide Up · 0.7 s"). */
  summary?: string;
  onReset?: () => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => openGroups.get(id) ?? defaultOpen);
  const toggle = () => {
    openGroups.set(id, !open);
    setOpen(!open);
  };
  return (
    <div className="border-border border-t" data-testid={`motion-group-${id}`} data-open={open}>
      <div className="flex items-center gap-1 py-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          <ChevronRight
            className={cn("text-muted-foreground size-3.5 shrink-0 transition-transform", open && "rotate-90")}
          />
          <span className="text-xs font-medium">{title}</span>
          {summary && <span className="text-muted-foreground ml-1 truncate text-[11px]">{summary}</span>}
        </button>
        {onReset && open && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onReset}
            aria-label={`Reset ${title} to default`}
            title="Reset to default"
          >
            <RotateCcw />
          </Button>
        )}
      </div>
      {open && <div className="space-y-2 pb-3">{children}</div>}
    </div>
  );
}

export function Hint({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" }) {
  return (
    <p
      className={cn(
        "text-[11px] leading-relaxed",
        tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
      )}
      role={tone === "warn" ? "status" : undefined}
    >
      {children}
    </p>
  );
}

const fmt = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

interface Bar {
  key: string;
  label: string;
  from: number;
  to: number;
  className: string;
}

/**
 * Read-only strip of when the selected layer's animation phases happen within the
 * scene. Not an editable timeline — values are changed with the controls above.
 */
export function TimingOverview({
  layer,
  timing,
  sceneDurationMs,
  transition,
}: {
  layer: Layer;
  timing: LayerTiming | undefined;
  sceneDurationMs: number;
  /** Photo 1 → Photo 2 window when the layer is part of a pair. */
  transition?: { from: number; to: number } | null;
}) {
  if (!timing) {
    return <Hint>Hidden layers don’t animate. Show the layer to see its timing.</Hint>;
  }
  const exits = Number.isFinite(timing.exitStart);
  const bars: Bar[] = [];
  if (timing.entranceEnd > timing.start) {
    bars.push({
      key: "entrance",
      label: "Entrance",
      from: timing.start,
      to: timing.entranceEnd,
      className: "bg-sky-500",
    });
  }
  bars.push({
    key: "hold",
    label: "Visible",
    from: timing.entranceEnd,
    to: exits ? timing.exitStart : sceneDurationMs,
    className: "bg-foreground/25",
  });
  if (exits)
    bars.push({ key: "exit", label: "Exit", from: timing.exitStart, to: timing.exitEnd, className: "bg-rose-500" });
  if (layer.motion.continuous.preset !== "none" && (layer.type === "image" || layer.type === "logo")) {
    bars.push({
      key: "camera",
      label: "Camera",
      from: timing.continuousStart,
      to: timing.continuousEnd,
      className: "bg-amber-500",
    });
  }
  if (transition) {
    bars.push({
      key: "transition",
      label: "Photo 2 in",
      from: transition.from,
      to: transition.to,
      className: "bg-violet-500",
    });
  }

  const extent = Math.max(sceneDurationMs, ...bars.map((b) => b.to));
  const pct = (ms: number) => `${(Math.max(0, Math.min(ms, extent)) / extent) * 100}%`;
  const issues = timingIssues(layer, timing, sceneDurationMs);
  const seconds = Math.floor(extent / 1000);

  return (
    <div className="space-y-1.5" data-testid="timing-overview">
      {bars.map((bar) => (
        <div
          key={bar.key}
          className="flex items-center gap-2"
          data-testid={`timing-bar-${bar.key}`}
          data-from={bar.from}
          data-to={bar.to}
        >
          <span className="text-muted-foreground w-16 shrink-0 text-[11px]">{bar.label}</span>
          <div className="bg-muted relative h-2 flex-1 rounded-full">
            {extent > sceneDurationMs && (
              <div
                className="absolute inset-y-0 rounded-r-full bg-amber-200/60 dark:bg-amber-900/40"
                style={{ left: pct(sceneDurationMs), right: 0 }}
                aria-hidden
              />
            )}
            <div
              className={cn("absolute inset-y-0 rounded-full", bar.className, bar.to <= bar.from && "w-0.5")}
              style={{
                left: pct(bar.from),
                width: bar.to > bar.from ? `calc(${pct(bar.to)} - ${pct(bar.from)})` : undefined,
              }}
              title={`${bar.label}: ${fmt(bar.from)} – ${fmt(bar.to)}`}
            />
          </div>
          <span className="text-muted-foreground w-20 shrink-0 text-right text-[10px] tabular-nums">
            {fmt(bar.from)}–{fmt(bar.to)}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0" />
        <div className="text-muted-foreground relative h-3 flex-1 text-[9px] tabular-nums">
          {Array.from({ length: seconds + 1 }, (_, s) => (
            <span key={s} className="absolute -translate-x-1/2" style={{ left: pct(s * 1000) }}>
              {s}s
            </span>
          ))}
        </div>
        <span className="w-20 shrink-0 text-right text-[10px]">scene {fmt(sceneDurationMs)}</span>
      </div>
      {issues.map((issue) => (
        <Hint key={issue} tone="warn">
          {issue}
        </Hint>
      ))}
    </div>
  );
}
