import { describe, expect, it } from "vitest";
import { defaultBrandKit } from "./brand-kit";
import { buildExportPlan, safeName, singleExportItem } from "./export-plan";
import type { Scene } from "./scene";
import { defaultProjectScenes } from "./scene-templates";

const scenes: Scene[] = defaultProjectScenes(defaultBrandKit()).map((t, position) => ({
  id: `00000000-0000-4000-8000-00000000000${position}`,
  projectId: "00000000-0000-4000-8000-0000000000ff",
  name: t.name,
  kind: t.kind,
  position,
  revision: 1,
  document: t.document,
  updatedAt: "2026-01-01T00:00:00Z",
}));
const project = { brandName: "Acura", modelName: "MDX" };

describe("export plan", () => {
  it("produces the Creative Package structure", () => {
    const plan = buildExportPlan(project, scenes);
    expect(plan.zipName).toBe("Acura_MDX_EverythingAds.zip");
    expect(plan.items.map((i) => `${i.folder}/${i.filename}`)).toEqual([
      "Motion_Tile/Acura_MDX_Motion_Tile_1080x1080.mp4",
      "Facebook_Build/01_Intro_1080x1920.mp4",
      "Facebook_Build/02_Exterior_1080x1920.mp4",
      "Facebook_Build/03_Interior_1080x1920.mp4",
      "Facebook_Build/04_Performance_1080x1920.mp4",
      "Facebook_Build/05_Outro_1080x1620.mp4",
      "Facebook_Build/06_CTA_1080x300.png",
    ]);
    expect(plan.missing).toEqual([]);
  });

  it("uses dynamic, sanitized names", () => {
    const plan = buildExportPlan({ brandName: "Acura (Sample)", modelName: "MDX Type-S / A-Spec" }, scenes);
    expect(plan.zipName).toBe("Acura-Sample_MDX-Type-S-A-Spec_EverythingAds.zip");
    expect(safeName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeName("Citroën")).toBe("Citroen");
    expect(safeName("***")).toBe("Untitled");
  });

  it("uses actual scene dimensions in file names", () => {
    const tall = scenes.map((s) => (s.kind === "outro" ? { ...s, document: { ...s.document, height: 1700 } } : s));
    expect(buildExportPlan(project, tall).items.find((i) => i.label === "Outro")!.filename).toBe(
      "05_Outro_1080x1700.mp4",
    );
  });

  it("reports missing scenes and lists extra scenes as not included", () => {
    const withoutInterior = scenes.filter((s) => s.kind !== "interior");
    const extra = { ...scenes[2], id: "00000000-0000-4000-8000-0000000000aa", name: "Interior copy", position: 9 };
    const plan = buildExportPlan(project, [...withoutInterior, extra]);
    expect(plan.items.find((i) => i.label === "Interior")?.sceneName).toBe("Interior copy");
    const plan2 = buildExportPlan(project, withoutInterior);
    expect(plan2.missing).toEqual(["Interior"]);
    expect(buildExportPlan(project, [...scenes, extra]).notIncluded).toEqual([
      { sceneId: extra.id, name: "Interior copy" },
    ]);
  });

  it("single exports reuse package names; custom scenes get a safe name", () => {
    expect(singleExportItem(project, scenes[6]).filename).toBe("06_CTA_1080x300.png");
    const custom = { ...scenes[0], kind: "custom" as const, name: "Night drive!" };
    expect(singleExportItem(project, custom)).toMatchObject({
      filename: "Acura_MDX_Night-drive_1080x1920.mp4",
      format: "mp4",
    });
  });
});
