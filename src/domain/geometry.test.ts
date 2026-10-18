import { describe, expect, it } from "vitest";
import { fitImageRect, fitScale, linearGradientPoints, radialGradientRadius, visibleImageRegion } from "./geometry";

describe("fitImageRect", () => {
  const landscape = { width: 2000, height: 1000 };
  const portraitFrame = { width: 1080, height: 1920 };

  it("cover fills the frame and centers by default", () => {
    const r = fitImageRect(landscape, portraitFrame, "cover", 0.5, 0.5);
    expect(r.height).toBeCloseTo(1920);
    expect(r.width).toBeCloseTo(3840);
    expect(r.x).toBeCloseTo((1080 - 3840) / 2);
    expect(r.y).toBeCloseTo(0);
  });

  it("focal point follows CSS object-position percentages", () => {
    expect(fitImageRect(landscape, portraitFrame, "cover", 0, 0.5).x).toBeCloseTo(0);
    expect(fitImageRect(landscape, portraitFrame, "cover", 1, 0.5).x).toBeCloseTo(1080 - 3840);
  });

  it("contain fits inside the frame", () => {
    const r = fitImageRect(landscape, portraitFrame, "contain", 0.5, 0.5);
    expect(r.width).toBeCloseTo(1080);
    expect(r.height).toBeCloseTo(540);
    expect(r.y).toBeCloseTo((1920 - 540) / 2);
  });

  it("zoom scales the fitted size around the focal point", () => {
    const r = fitImageRect({ width: 1080, height: 1080 }, { width: 1080, height: 1080 }, "cover", 0.5, 0.5, 2);
    expect(r).toEqual({ x: -540, y: -540, width: 2160, height: 2160 });
  });

  it("fill stretches to the frame", () => {
    expect(fitImageRect(landscape, portraitFrame, "fill", 0.5, 0.5)).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
  });
});

describe("visibleImageRegion", () => {
  it("maps the visible part of a cover image back to source pixels", () => {
    const region = visibleImageRegion({ width: 2000, height: 1000 }, { width: 1000, height: 1000 }, "cover", 0.5, 0.5);
    expect(region).not.toBeNull();
    expect(region!.dest).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
    expect(region!.source.x).toBeCloseTo(500);
    expect(region!.source.width).toBeCloseTo(1000);
    expect(region!.source.height).toBeCloseTo(1000);
  });

  it("contain leaves letterbox space and uses the full source", () => {
    const region = visibleImageRegion(
      { width: 2000, height: 1000 },
      { width: 1000, height: 1000 },
      "contain",
      0.5,
      0.5,
    )!;
    expect(region.source).toEqual({ x: 0, y: 0, width: 2000, height: 1000 });
    expect(region.dest).toEqual({ x: 0, y: 250, width: 1000, height: 500 });
  });
});

describe("linearGradientPoints (CSS semantics)", () => {
  it("180deg runs top to bottom", () => {
    const { start, end } = linearGradientPoints(180, { width: 100, height: 200 });
    expect(start.x).toBeCloseTo(50);
    expect(start.y).toBeCloseTo(0);
    expect(end.x).toBeCloseTo(50);
    expect(end.y).toBeCloseTo(200);
  });

  it("90deg runs left to right", () => {
    const { start, end } = linearGradientPoints(90, { width: 100, height: 200 });
    expect(start).toEqual({ x: expect.closeTo(0), y: expect.closeTo(100) });
    expect(end).toEqual({ x: expect.closeTo(100), y: expect.closeTo(100) });
  });

  it("45deg extends so corners get the end colors", () => {
    const { start, end } = linearGradientPoints(45, { width: 100, height: 100 });
    // Gradient line length for a square at 45deg is the diagonal.
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeCloseTo(Math.SQRT2 * 100);
  });
});

describe("misc geometry", () => {
  it("radial radius reaches the farthest corner", () => {
    expect(radialGradientRadius({ width: 60, height: 80 })).toBeCloseTo(50);
  });

  it("fitScale keeps aspect ratio inside padded viewport", () => {
    expect(fitScale({ width: 1080, height: 1920 }, { width: 800, height: 1000 }, 40)).toBeCloseTo(920 / 1920);
  });
});
