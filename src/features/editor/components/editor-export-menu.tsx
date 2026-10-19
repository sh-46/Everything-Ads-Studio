"use client";

import { ChevronDown, Download, Loader2, Package, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadUrl, formatBytes, useExportJob } from "@/features/exports/use-export-job";
import { useSaveStatus } from "../hooks/use-autosave";
import { useActiveScene } from "../store/editor-store";

/** Tracks one scene's export (same job pipeline as the Creative Package). */
function SceneExportStatus({
  projectId,
  sceneId,
  onClose,
}: {
  projectId: string;
  sceneId: string;
  onClose: () => void;
}) {
  const exp = useExportJob(projectId, sceneId);
  const { start } = exp;
  useEffect(() => {
    void start();
  }, [start]);
  const item = exp.job?.items[0];
  return (
    <div
      className="bg-background fixed right-4 bottom-14 z-50 w-80 rounded-lg border p-3 text-xs shadow-lg"
      role="status"
      aria-live="polite"
      data-testid="scene-export-status"
      data-status={exp.job?.status ?? "starting"}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item?.filename ?? "Starting export…"}</p>
          <p className="text-muted-foreground">{exp.job?.stage ?? "Preparing"}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      {item?.status === "rendering" && (
        <div className="bg-muted mt-2 h-1 overflow-hidden rounded-full">
          <div className="bg-foreground h-full" style={{ width: `${Math.round(item.progress * 100)}%` }} />
        </div>
      )}
      {(exp.error || exp.job?.error) && (
        <p role="alert" className="text-destructive mt-2">
          {item?.error ?? exp.job?.error ?? exp.error}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        {exp.job?.status === "ready" && item && (
          <Button size="xs" asChild>
            <a href={downloadUrl(exp.job, item.key)} download data-testid="scene-export-download">
              <Download /> Download {formatBytes(item.bytes)}
            </a>
          </Button>
        )}
        {exp.job?.status === "failed" && (
          <Button size="xs" variant="outline" onClick={() => void exp.retry()}>
            Retry
          </Button>
        )}
        {exp.active && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
      </div>
    </div>
  );
}

/**
 * Export menu in the editor. The Creative Package remains the main action; a single
 * scene can also be exported. Exports render the saved scene, so they wait for autosave.
 */
export function EditorExportMenu({ projectId }: { projectId: string }) {
  const scene = useActiveScene();
  const { status } = useSaveStatus();
  const [exporting, setExporting] = useState<{ sceneId: string; n: number } | null>(null);
  const saved = status === "saved";
  const format = scene?.kind === "cta" ? "PNG" : "MP4";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" data-testid="editor-export">
            Export <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem asChild>
            <Link href={`/projects/${projectId}/export`}>
              <Package /> Export creative package…
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">This scene</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!scene || !saved}
            onSelect={() => scene && setExporting((e) => ({ sceneId: scene.id, n: (e?.n ?? 0) + 1 }))}
            data-testid="export-this-scene"
          >
            <Download /> Export {scene?.name ?? "scene"} ({format})
          </DropdownMenuItem>
          {!saved && <p className="text-muted-foreground px-2 pb-1.5 text-[11px]">Waiting for changes to save…</p>}
        </DropdownMenuContent>
      </DropdownMenu>
      {exporting && (
        <SceneExportStatus
          key={`${exporting.sceneId}:${exporting.n}`}
          projectId={projectId}
          sceneId={exporting.sceneId}
          onClose={() => setExporting(null)}
        />
      )}
    </>
  );
}
