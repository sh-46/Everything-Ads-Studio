import { describe, expect, it } from "vitest";
import { hexToRgba } from "./color";
import { defaultExportConfig, formatExportName } from "./export-config";
import { defaultMotion } from "./motion";
import { layerSchema, sceneDocumentSchema } from "./scene";

describe("layer schema", () => {
  it("fills defaults for older documents missing optional fields", () => {
    const parsed = layerSchema.parse({
      id: "l1",
      type: "text",
      name: "Headline",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      text: "Hi",
      fontFamily: "Arial",
      fontSize: 40,
      fontWeight: 700,
      color: "#FFFFFF",
    });
    expect(parsed.opacity).toBe(1);
    expect(parsed.visible).toBe(true);
    expect(parsed.motion).toEqual(defaultMotion());
  });

  it("rejects unknown layer types and bad colors", () => {
    const base = { id: "l", name: "x", x: 0, y: 0, width: 1, height: 1 };
    expect(layerSchema.safeParse({ ...base, type: "video" }).success).toBe(false);
    expect(layerSchema.safeParse({ ...base, type: "shape", fill: "red" }).success).toBe(false);
  });

  it("rejects documents with an unknown schema version", () => {
    expect(
      sceneDocumentSchema.safeParse({ schemaVersion: 2, width: 1080, height: 1920, background: "#000000", layers: [] })
        .success,
    ).toBe(false);
  });
});

describe("helpers", () => {
  it("hexToRgba", () => {
    expect(hexToRgba("#FF8000", 0.5)).toBe("rgba(255, 128, 0, 0.5)");
    expect(hexToRgba("#000000", 2)).toBe("rgba(0, 0, 0, 1)");
  });

  it("export defaults", () => {
    expect(defaultExportConfig()).toMatchObject({ fps: 30, videoFormat: "mp4", imageFormat: "png" });
  });

  it("formats export names with slugged tokens", () => {
    expect(
      formatExportName("{brand}_{year}_{model}_{scene}_{width}x{height}", {
        brand: "Acura",
        year: 2026,
        model: "MDX Type S",
        scene: "Interior",
        width: 1080,
        height: 1920,
      }),
    ).toBe("Acura_2026_MDX-Type-S_Interior_1080x1920");
  });
});
