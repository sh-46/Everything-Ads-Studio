"use client";

import { DisclosurePromptDialog } from "@/features/assets/components/disclosure-prompt-dialog";
import { useEditorStore } from "../store/editor-store";

/** The editor's pending photo change (replace, remove, delete) waiting for a disclosure answer. */
export function DisclosureChangeDialog() {
  const pending = useEditorStore((s) => s.pendingPhotoChange);
  const resolve = useEditorStore((s) => s.resolvePhotoChange);
  return <DisclosurePromptDialog prompt={pending?.plan.prompt} onResolve={resolve} />;
}
