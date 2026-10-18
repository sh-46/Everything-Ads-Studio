"use client";

import { Plus } from "lucide-react";
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
import { createProject } from "../actions";

export function CreateProjectDialog({ brandId, brandName }: { brandId: string; brandName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modelYear, setModelYear] = useState(String(new Date().getFullYear() + 1));
  const [modelName, setModelName] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suggestedName = [modelYear, brandName, modelName].filter(Boolean).join(" ");
  const projectName = nameTouched ? name : suggestedName;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createProject(brandId, { name: projectName, modelYear: Number(modelYear), modelName });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/projects/${result.data.id}/editor`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New {brandName} model project</DialogTitle>
            <DialogDescription>
              Creates Intro, Exterior, Interior, Performance, Outro, Square Feed and CTA scenes using the {brandName}{" "}
              Brand Kit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[96px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="model-year">Year</Label>
              <Input
                id="model-year"
                inputMode="numeric"
                value={modelYear}
                onChange={(e) => setModelYear(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model-name">Model</Label>
              <Input
                id="model-name"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="e.g. MDX"
                autoFocus
                required
                maxLength={120}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
              required
              maxLength={160}
            />
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending || !modelName.trim() || !projectName.trim()}>
              {pending ? "Creating…" : "Create and open editor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
