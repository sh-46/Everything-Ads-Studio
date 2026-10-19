"use client";

import { useId, useState } from "react";
import { cn } from "cn";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Compact inspector controls. Each commits on change with a coalescing key upstream. */

export function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="border-border border-b px-3 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{title}</h3>
        {aside}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-2", className)}>{children}</div>;
}

const inputClass =
  "h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-xs tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";

export function NumberField({
  label,
  wide = false,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  precision = 0,
  disabled,
}: {
  label: string;
  /** Wider label column for longer, clearer labels. */
  wide?: boolean;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  precision?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const format = (v: number) => String(Number(v.toFixed(precision)));
  const [draft, setDraft] = useState(format(value));
  const [focused, setFocused] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);

  // Follow external changes (drag, undo) unless the user is mid-edit.
  if (!focused && value !== syncedValue) {
    setSyncedValue(value);
    setDraft(format(value));
  }

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <label htmlFor={id} className="flex items-center gap-1.5">
      <span className={cn("text-muted-foreground shrink-0 text-[11px]", wide ? "w-16" : "w-9")} title={label}>
        {label}
      </span>
      <div className="relative min-w-0 flex-1">
        <input
          id={id}
          className={cn(inputClass, suffix && "pr-6")}
          inputMode="decimal"
          value={draft}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setDraft(format(value));
          }}
          onChange={(e) => {
            setDraft(e.target.value);
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const delta = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              const next = Number((value + delta).toFixed(precision + 2));
              commit(String(next));
              setDraft(format(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))));
            } else if (e.key === "Enter") {
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {suffix && (
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px]">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value.toUpperCase());
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value.toUpperCase());
  }
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-muted-foreground w-9 shrink-0 text-[11px]">
        {label}
      </label>
      <input
        type="color"
        aria-label={`${label} color picker`}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="border-input h-7 w-7 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
      />
      <input
        id={id}
        className={inputClass}
        value={draft}
        onChange={(e) => {
          const next = e.target.value.trim();
          setDraft(next);
          const normalized = next.startsWith("#") ? next : `#${next}`;
          if (/^#[0-9a-fA-F]{6}$/.test(normalized)) onChange(normalized.toUpperCase());
        }}
        onBlur={() => setDraft(value.toUpperCase())}
      />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  wide = false,
  value,
  options,
  onChange,
}: {
  label: string;
  /** Wider label column for longer, clearer labels. */
  wide?: boolean;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("text-muted-foreground shrink-0 text-[11px]", wide ? "w-16" : "w-9")}>{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger size="sm" className="h-7 w-full min-w-0 text-xs" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function RangeField({
  label,
  wide = false,
  value,
  onChange,
  min,
  max,
  step,
  format = (v) => v.toFixed(2),
}: {
  label: string;
  /** Wider label column for longer, clearer labels. */
  wide?: boolean;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (value: number) => string;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-1.5">
      <label
        htmlFor={id}
        className={cn("text-muted-foreground shrink-0 text-[11px]", wide ? "w-16" : "w-9")}
        title={label}
      >
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-foreground h-1 min-w-0 flex-1 cursor-pointer"
      />
      <span className="text-muted-foreground w-10 text-right text-[11px] tabular-nums">{format(value)}</span>
    </div>
  );
}
