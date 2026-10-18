"use client";

import { AlertTriangle, Check, ChevronRight, CloudOff, Loader2, Redo2, Undo2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/app/demo-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSaveStatus } from "../hooks/use-autosave";
import { useEditorStore } from "../store/editor-store";

function SaveIndicator() {
  const { status, message } = useSaveStatus();
  const content = {
    saved: { icon: <Check className="size-3.5" />, label: "Saved", className: "text-muted-foreground" },
    unsaved: {
      icon: <span className="size-1.5 rounded-full bg-amber-500" />,
      label: "Unsaved",
      className: "text-muted-foreground",
    },
    saving: {
      icon: <Loader2 className="size-3.5 animate-spin" />,
      label: "Saving…",
      className: "text-muted-foreground",
    },
    error: { icon: <CloudOff className="size-3.5" />, label: "Save failed — retrying", className: "text-destructive" },
    conflict: {
      icon: <AlertTriangle className="size-3.5" />,
      label: "Conflict",
      className: "text-amber-600 dark:text-amber-400",
    },
  }[status];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-1.5 text-xs ${content.className}`}
      title={message ?? undefined}
      data-testid="save-status"
    >
      {content.icon}
      <span>{content.label}</span>
    </div>
  );
}

export function EditorTopBar({
  brandId,
  brandName,
  projectId,
  projectName,
  demoMode,
}: {
  brandId: string;
  brandName: string;
  projectId: string;
  projectName: string;
  demoMode: boolean;
}) {
  const canUndo = useEditorStore((s) => s.history.past.length > 0);
  const canRedo = useEditorStore((s) => s.history.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  return (
    <header className="border-border bg-background flex h-11 shrink-0 items-center gap-3 border-b px-3">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-xs">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          EAS
        </Link>
        <ChevronRight className="text-muted-foreground size-3" aria-hidden />
        <Link href={`/brands/${brandId}`} className="text-muted-foreground hover:text-foreground truncate">
          {brandName}
        </Link>
        <ChevronRight className="text-muted-foreground size-3" aria-hidden />
        <Link href={`/projects/${projectId}`} className="text-muted-foreground hover:text-foreground truncate">
          {projectName}
        </Link>
        <ChevronRight className="text-muted-foreground size-3" aria-hidden />
        <span className="font-medium">Editor</span>
      </nav>

      {demoMode && <DemoBadge />}
      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Undo" disabled={!canUndo} onClick={undo}>
              <Undo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo (⌘Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Redo" disabled={!canRedo} onClick={redo}>
              <Redo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo (⇧⌘Z)</TooltipContent>
        </Tooltip>
        <div className="bg-border mx-2 h-4 w-px" />
        <SaveIndicator />
        <div className="bg-border mx-2 h-4 w-px" />
        <Button variant="outline" size="sm" asChild>
          <Link href={`/projects/${projectId}/preview`}>Preview</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href={`/projects/${projectId}/export`}>Export</Link>
        </Button>
      </div>
    </header>
  );
}
