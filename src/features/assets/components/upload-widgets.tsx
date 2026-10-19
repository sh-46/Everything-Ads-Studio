"use client";

import { AlertCircle, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ACCEPT, type AssetKind } from "@/domain/asset";
import type { UploadItem } from "./use-uploader";

/** Click-to-browse plus drag-and-drop target for local files. */
export function FileDropZone({
  kind,
  onFiles,
  multiple = true,
  label,
  hint,
  compact = false,
  disabled,
  testId,
}: {
  kind: AssetKind;
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  label: string;
  hint?: string;
  compact?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className={cn(
        "rounded-lg border border-dashed text-center transition-colors",
        compact ? "p-2" : "p-5",
        over ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[kind]}
        multiple={multiple}
        className="sr-only"
        aria-label={label}
        data-testid={testId}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <Upload /> {label}
      </Button>
      {!compact && <p className="text-muted-foreground mt-2 text-xs">{hint ?? "or drag files here"}</p>}
    </div>
  );
}

export function UploadQueue({ items, onDismiss }: { items: UploadItem[]; onDismiss: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1" aria-label="Uploads">
      {items.map((u) => (
        <li
          key={u.id}
          className={cn(
            "flex items-start gap-2 rounded-md border px-2 py-1.5 text-[11px]",
            u.status === "error" ? "border-destructive/40 text-destructive" : "border-border text-muted-foreground",
          )}
        >
          {u.status === "uploading" ? (
            <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin" />
          ) : (
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{u.status === "uploading" ? `Uploading ${u.name}…` : u.name}</span>
            {u.error && <span className="block">{u.error}</span>}
          </span>
          {u.status === "error" && (
            <button type="button" className="underline" onClick={() => onDismiss(u.id)}>
              Dismiss
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
