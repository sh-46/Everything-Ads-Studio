"use client";

import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DisclosureDecision, PhotoChangePlan } from "@/domain/disclosures";

/** Asks what should happen to a disclosure when its photo is replaced, removed or deleted. */
export function DisclosurePromptDialog({
  prompt,
  onResolve,
}: {
  prompt: PhotoChangePlan["prompt"] | undefined;
  /** null = cancel the change. */
  onResolve: (decision: DisclosureDecision | null) => void;
}) {
  return (
    <Dialog open={Boolean(prompt)} onOpenChange={(open) => !open && onResolve(null)}>
      {prompt && (
        <DialogContent className="sm:max-w-md" data-testid="disclosure-change-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-amber-600" aria-hidden />
              {prompt.title}
            </DialogTitle>
            <DialogDescription>{prompt.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
            <Button onClick={() => onResolve("apply")} data-testid="disclosure-change-apply">
              {prompt.applyLabel}
            </Button>
            {prompt.alternatives.map((alt) => (
              <Button
                key={alt.decision}
                variant="outline"
                onClick={() => onResolve(alt.decision)}
                data-testid={`disclosure-change-${alt.decision}`}
              >
                {alt.label}
              </Button>
            ))}
            <Button variant="ghost" onClick={() => onResolve(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
