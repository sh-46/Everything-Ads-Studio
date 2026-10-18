"use client";

import { Archive, ArchiveRestore, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, type ProjectStatus } from "@/domain/project";
import { duplicateProject, setProjectArchived, setProjectStatus } from "../actions";

export function ProjectActions({
  projectId,
  projectName,
  status,
  archived,
}: {
  projectId: string;
  projectName: string;
  status: ProjectStatus;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupName, setDupName] = useState(`${projectName} copy`);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Something went wrong");
      else {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={(v) => run(() => setProjectStatus(projectId, v))} disabled={pending}>
          <SelectTrigger aria-label="Project status" size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={dupOpen} onOpenChange={setDupOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={pending}>
              <Copy /> Duplicate
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const result = await duplicateProject(projectId, dupName);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setDupOpen(false);
                  router.push(`/projects/${result.data.id}`);
                });
              }}
            >
              <DialogHeader>
                <DialogTitle>Duplicate project</DialogTitle>
                <DialogDescription>Copies every scene and layer. Photos are shared, not re-uploaded.</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="dup-name">Name</Label>
                <Input
                  id="dup-name"
                  value={dupName}
                  onChange={(e) => setDupName(e.target.value)}
                  maxLength={160}
                  required
                />
              </div>
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button type="submit" disabled={pending || !dupName.trim()}>
                  {pending ? "Duplicating…" : "Duplicate"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => setProjectArchived(projectId, !archived))}
        >
          {archived ? <ArchiveRestore /> : <Archive />}
          {archived ? "Restore" : "Archive"}
        </Button>
      </div>
      {error && !dupOpen && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
