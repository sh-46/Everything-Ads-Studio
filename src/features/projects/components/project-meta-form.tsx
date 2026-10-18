"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProjectMeta } from "../actions";

export function ProjectMetaForm({
  projectId,
  initial,
}: {
  projectId: string;
  initial: { name: string; modelYear: number; modelName: string };
}) {
  const router = useRouter();
  const [values, setValues] = useState({ ...initial, modelYear: String(initial.modelYear) });
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty =
    values.name !== initial.name ||
    values.modelName !== initial.modelName ||
    values.modelYear !== String(initial.modelYear);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updateProjectMeta(projectId, { ...values, modelYear: Number(values.modelYear) });
          setMessage(result.ok ? { error: false, text: "Saved" } : { error: true, text: result.error });
          if (result.ok) router.refresh();
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="meta-name">Project name</Label>
        <Input
          id="meta-name"
          value={values.name}
          maxLength={160}
          onChange={(e) => setValues({ ...values, name: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-[96px_1fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="meta-year">Year</Label>
          <Input
            id="meta-year"
            inputMode="numeric"
            value={values.modelYear}
            onChange={(e) => setValues({ ...values, modelYear: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="meta-model">Model</Label>
          <Input
            id="meta-model"
            value={values.modelName}
            maxLength={120}
            onChange={(e) => setValues({ ...values, modelName: e.target.value })}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="outline" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save details"}
        </Button>
        {message && (
          <span
            role={message.error ? "alert" : "status"}
            className={message.error ? "text-destructive text-xs" : "text-muted-foreground text-xs"}
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
