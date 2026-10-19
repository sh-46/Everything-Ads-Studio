"use client";

import { useMemo } from "react";
import { disclosureIssues, type DisclosureIssue } from "@/domain/disclosures";
import { fontStack } from "@/domain/fonts";
import { canvasMeasure } from "@/domain/text-layout";
import { useActiveScene, useEditorStore } from "../store/editor-store";

/** Live disclosure review for the active scene (same checks as the pre-export review). */
export function useDisclosureIssues(): DisclosureIssue[] {
  const scene = useActiveScene();
  const assets = useEditorStore((s) => s.assets);
  const fontsVersion = useEditorStore((s) => s.fontsVersion);
  return useMemo(() => {
    if (!scene) return [];
    void fontsVersion; // re-measure once brand fonts have loaded
    return disclosureIssues(scene.document, new Map(assets.map((a) => [a.id, a])), canvasMeasure(fontStack));
  }, [scene, assets, fontsVersion]);
}
