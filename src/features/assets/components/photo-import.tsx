"use client";

import { ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DISCLOSURE_MAX_LENGTH, disclosureMetaIssue, type PhotoDisclosure } from "@/domain/asset";

/**
 * Asks, before photos are uploaded, whether each one requires a legal disclosure and
 * what its exact wording is. Every photo upload path goes through `askPhotoDisclosures`,
 * so disclosures are captured at import. Wording is never suggested or generated.
 */

interface Request {
  files: File[];
  resolve: (result: PhotoDisclosure[] | null) => void;
}

const useImportStore = create<{ request: Request | null }>(() => ({ request: null }));

/** Resolves with one disclosure per file (in order), or null if the user cancels. */
export function askPhotoDisclosures(files: File[]): Promise<PhotoDisclosure[] | null> {
  // No host mounted (e.g. tests): import without disclosures rather than hang.
  if (!hostMounted) return Promise.resolve(files.map(() => ({ requiresDisclosure: false })));
  return new Promise((resolve) => {
    useImportStore.getState().request?.resolve(null);
    useImportStore.setState({ request: { files, resolve } });
  });
}

let hostMounted = false;

interface Row {
  requires: boolean;
  text: string;
}

/** Mounted once (root layout). Shows the import step whenever photos are uploaded. */
export function PhotoImportHost() {
  const request = useImportStore((s) => s.request);
  useEffect(() => {
    hostMounted = true;
    return () => {
      hostMounted = false;
    };
  }, []);
  return request ? <ImportDialog key={request.files.map((f) => f.name).join("|")} request={request} /> : null;
}

function ImportDialog({ request }: { request: Request }) {
  const [rows, setRows] = useState<Row[]>(() => request.files.map(() => ({ requires: false, text: "" })));
  const [submitted, setSubmitted] = useState(false);
  const issues = rows.map((r) => disclosureMetaIssue({ requiresDisclosure: r.requires, disclosureText: r.text }));
  const invalid = issues.some(Boolean);

  const close = (result: PhotoDisclosure[] | null) => {
    useImportStore.setState({ request: null });
    request.resolve(result);
  };
  const submit = () => {
    setSubmitted(true);
    if (invalid) return;
    close(
      rows.map((r) =>
        r.requires ? { requiresDisclosure: true, disclosureText: r.text.trim() } : { requiresDisclosure: false },
      ),
    );
  };
  const set = (index: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const applyFirstToAll = () => setRows((list) => list.map(() => ({ ...list[0] })));

  return (
    <Dialog open onOpenChange={(open) => !open && close(null)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl" data-testid="photo-import-dialog">
        <DialogHeader>
          <DialogTitle>Import {request.files.length === 1 ? "photo" : `${request.files.length} photos`}</DialogTitle>
          <DialogDescription>
            Does a photo need an on-screen disclosure (e.g. “Pre-production model shown”)? Enter the exact wording you
            were given — it’s shown wherever the photo is used. You can change this later in the project photo library.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {request.files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="border-border space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium" title={file.name}>
                  {file.name}
                </p>
                <label className="flex shrink-0 items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={rows[index].requires}
                    onChange={(e) => set(index, { requires: e.target.checked })}
                    data-testid={`import-requires-${index}`}
                  />
                  Requires disclosure
                </label>
              </div>
              {rows[index].requires && (
                <>
                  <Textarea
                    aria-label={`Disclosure text for ${file.name}`}
                    placeholder="Paste the exact disclosure wording for this photo"
                    className="min-h-16 text-xs"
                    maxLength={DISCLOSURE_MAX_LENGTH}
                    value={rows[index].text}
                    onChange={(e) => set(index, { text: e.target.value })}
                    data-testid={`import-text-${index}`}
                  />
                  {submitted && issues[index] && (
                    <p role="alert" className="text-destructive text-xs">
                      {issues[index]}
                    </p>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        {request.files.length > 1 && (
          <Button variant="ghost" size="xs" className="self-start" onClick={applyFirstToAll}>
            Use the first photo’s setting for all
          </Button>
        )}
        <p className="text-muted-foreground flex items-start gap-1.5 text-[11px]">
          <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          Everything Ads never writes disclosure wording. Photos marked as requiring a disclosure get a disclosure layer
          when placed in a scene, and exports warn if it’s missing, hidden or clipped.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(null)}>
            Cancel
          </Button>
          <Button onClick={submit} data-testid="import-confirm">
            Upload {request.files.length === 1 ? "photo" : `${request.files.length} photos`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
