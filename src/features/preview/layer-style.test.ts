import { describe, expect, it } from "vitest";
import { fontStack } from "@/domain/fonts";
import { linearGradientPoints, visibleImageRegion } from "@/domain/geometry";
import { IDENTITY_MOTION } from "@/domain/motion-engine";
import { cornerRadius, gradientCss, imageRect, layerTransform, textStyle } from "./layer-style";

/**
 * Konva (editor) and Remotion/CSS (preview) consistency. Each test pins one place where
 * the two renderers must agree on the same scene data.
 */
describe("Konva ↔ CSS geometry consistency", () => {
  it("image placement: CSS rect clipped to the frame equals the Konva crop destination", () => {
    const media = { width: 2400, height: 1600 };
    const frame = { width: 1080, height: 1190 };
    for (const [fit, fx, fy, zoom] of [
      ["cover", 0.5, 0.5, 1],
      ["cover", 0.2, 0.8, 1.3],
      ["contain", 0.5, 0.5, 1],
      ["fill", 0.5, 0.5, 1.1],
    ] as const) {
      const css = imageRect(media, frame, fit, fx, fy, zoom);
      const konva = visibleImageRegion(media, frame, fit, fx, fy, zoom)!;
      const clipped = {
        x: Math.max(0, css.x),
        y: Math.max(0, css.y),
        width: Math.min(frame.width, css.x + css.width) - Math.max(0, css.x),
        height: Math.min(frame.height, css.y + css.height) - Math.max(0, css.y),
      };
      for (const key of ["x", "y", "width", "height"] as const) expect(clipped[key]).toBeCloseTo(konva.dest[key], 6);
    }
  });

  it("gradient: CSS angle uses the same semantics as the Konva gradient line", () => {
    const fill = {
      gradientType: "linear" as const,
      angle: 180,
      stops: [
        { offset: 1, color: "#000000", opacity: 0.85 },
        { offset: 0, color: "#000000", opacity: 0 },
      ],
    };
    expect(gradientCss(fill)).toBe("linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.85) 100%)");
    // 180deg in CSS runs top → bottom; the Konva points must too.
    const { start, end } = linearGradientPoints(180, { width: 100, height: 200 });
    expect(start.y).toBeLessThan(end.y);
    expect(gradientCss({ ...fill, gradientType: "radial" })).toMatch(
      /^radial-gradient\(circle farthest-corner at center/,
    );
  });

  it("typography: same font stack, size, weight, tracking and line height", () => {
    const style = textStyle({
      id: "t",
      type: "text",
      name: "t",
      text: "x",
      fontFamily: "Acura Bespoke",
      fontSize: 92,
      fontWeight: 700,
      letterSpacing: -1.5,
      lineHeight: 1.05,
      color: "#FFFFFF",
      align: "left",
      x: 0,
      y: 0,
      width: 920,
      height: 194,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      motion: undefined as never,
      visibility: undefined as never,
      disclosure: null,
    });
    expect(style).toMatchObject({
      fontFamily: fontStack("Acura Bespoke"),
      fontSize: 92,
      fontWeight: 700,
      letterSpacing: -1.5,
      lineHeight: 1.05,
      width: 920,
    });
    expect(fontStack('Weird"Name')).toBe('"WeirdName", "Helvetica Neue", Arial, sans-serif');
  });

  it("rotation pivots on the top-left like Konva; no motion adds no transform", () => {
    expect(layerTransform({ width: 100, height: 50, rotation: 0 }, IDENTITY_MOTION)).toBe("none");
    expect(layerTransform({ width: 100, height: 50, rotation: 15 }, IDENTITY_MOTION)).toBe("rotate(15deg)");
  });

  it("corner radius is clamped like Konva", () => {
    expect(cornerRadius({ width: 460, height: 128, cornerRadius: 999 })).toBe(64);
  });
});
