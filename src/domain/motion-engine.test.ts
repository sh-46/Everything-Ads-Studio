import { describe, expect, it } from "vitest";
import { defaultMotion, entranceLabel, motionConfigSchema, type MotionConfig } from "./motion";
import {
  cameraCoverage,
  computeSceneTimings,
  ease,
  evaluateMotion,
  frameToMs,
  msToFrames,
  timingIssues,
} from "./motion-engine";
import { makeLayer, type ImageLayer, type Layer, type TextLayer } from "./scene";

const base = defaultMotion();
const motion = (patch: Partial<MotionConfig> = {}): MotionConfig => ({ ...defaultMotion(), ...patch });
const entrance = (patch: Partial<MotionConfig["entrance"]>) => ({ ...base.entrance, ...patch });

const text = (id: string, m: MotionConfig): TextLayer =>
  makeLayer<TextLayer>({
    id,
    type: "text",
    name: id,
    text: "Hi",
    fontFamily: "Arial",
    fontSize: 40,
    fontWeight: 700,
    letterSpacing: 0,
    lineHeight: 1.2,
    color: "#FFFFFF",
    align: "left",
    x: 0,
    y: 0,
    width: 500,
    height: 100,
    motion: m,
  });

const image = (id: string, m: MotionConfig, patch: Partial<ImageLayer> = {}): ImageLayer =>
  makeLayer<ImageLayer>({
    id,
    type: "image",
    name: id,
    assetId: null,
    fit: "cover",
    focalX: 0.5,
    focalY: 0.5,
    zoom: 1,
    x: 0,
    y: 0,
    width: 1080,
    height: 1920,
    motion: m,
    ...patch,
  });

const timingOf = (layers: Layer[], id: string, duration = 6000) => computeSceneTimings(layers, duration).get(id)!;

describe("timing & sequencing", () => {
  it("Fade In + Slide Up with 0.3s delay and 0.8s duration", () => {
    const headline = text(
      "h",
      motion({ delayMs: 300, entrance: entrance({ fade: true, move: "slideUp", durationMs: 800 }) }),
    );
    const t = timingOf([headline], "h");
    expect(t.start).toBe(300);
    expect(t.entranceEnd).toBe(1100);
  });

  it("With previous / After previous chain off the layer below", () => {
    const a = text("a", motion({ delayMs: 200, entrance: entrance({ fade: true, durationMs: 500 }) }));
    const b = text(
      "b",
      motion({ sequencing: "withPrevious", delayMs: 100, entrance: entrance({ fade: true, durationMs: 400 }) }),
    );
    const c = text(
      "c",
      motion({ sequencing: "afterPrevious", delayMs: 50, entrance: entrance({ fade: true, durationMs: 300 }) }),
    );
    const timings = computeSceneTimings([a, b, c], 6000);
    expect(timings.get("b")!.start).toBe(300);
    expect(timings.get("c")!.start).toBe(750);
  });

  it("hidden layers don't take part in sequencing", () => {
    const a = text("a", motion({ delayMs: 1000 }));
    const hidden = { ...text("x", motion({ delayMs: 5000 })), visible: false };
    const b = text("b", motion({ sequencing: "withPrevious" }));
    expect(computeSceneTimings([a, hidden, b], 6000).get("b")!.start).toBe(1000);
  });

  it("exit with hold 0 finishes at the scene end; with hold it follows the entrance", () => {
    const atEnd = text("e", motion({ exit: { ...base.exit, preset: "fadeOut", durationMs: 400 } }));
    expect(timingOf([atEnd], "e")).toMatchObject({ exitStart: 5600, exitEnd: 6000 });
    const held = text(
      "h",
      motion({
        holdMs: 1000,
        entrance: entrance({ fade: true, durationMs: 500 }),
        exit: { ...base.exit, preset: "fadeOut", durationMs: 400 },
      }),
    );
    expect(timingOf([held], "h")).toMatchObject({ exitStart: 1500, exitEnd: 1900 });
  });

  it("warns when animation runs past the scene end", () => {
    const late = text("l", motion({ delayMs: 5500, entrance: entrance({ fade: true, durationMs: 1000 }) }));
    expect(timingIssues(late, timingOf([late], "l"), 6000)[0]).toMatch(/Entrance ends at 6.50 s/);
    const camera = image("p", motion({ continuous: { ...base.continuous, preset: "slowZoomIn", durationMs: 8000 } }));
    expect(timingIssues(camera, timingOf([camera], "p"), 6000).join()).toMatch(/Camera motion runs to 8.00 s/);
    const fine = text("f", motion({ entrance: entrance({ fade: true }) }));
    expect(timingIssues(fine, timingOf([fine], "f"), 6000)).toEqual([]);
  });
});

describe("combinable entrances", () => {
  const at = (layer: Layer, t: number) => evaluateMotion(layer, timingOf([layer], layer.id), t);
  const lin = { durationMs: 1000, easing: "linear" as const, distance: 80 };

  it("Fade In + Slide Up moves and fades", () => {
    const l = text("a", motion({ entrance: entrance({ fade: true, move: "slideUp", ...lin }) }));
    expect(at(l, 500)).toMatchObject({ translateY: 40, opacity: 0.5 });
  });

  it("Slide Up only moves at full opacity", () => {
    const l = text("a", motion({ entrance: entrance({ fade: false, move: "slideUp", ...lin }) }));
    expect(at(l, 500)).toMatchObject({ translateY: 40, opacity: 1 });
  });

  it("Scale In only scales at full opacity", () => {
    const l = text("a", motion({ entrance: entrance({ fade: false, move: "scaleIn", scaleStart: 0.8, ...lin }) }));
    const s = at(l, 500);
    expect(s.scale).toBeCloseTo(0.9);
    expect(s.opacity).toBe(1);
  });

  it.each([
    ["slideDown", { translateY: -40 }],
    ["slideLeft", { translateX: 40 }],
    ["slideRight", { translateX: -40 }],
  ] as const)("Fade In + %s", (move, expected) => {
    const l = text("a", motion({ entrance: entrance({ fade: true, move, ...lin }) }));
    expect(at(l, 500)).toMatchObject({ ...expected, opacity: 0.5 });
  });

  it("a delayed movement-only layer is hidden until it starts", () => {
    const l = text("a", motion({ delayMs: 400, entrance: entrance({ fade: false, move: "slideUp", ...lin }) }));
    expect(at(l, 100).opacity).toBe(0);
    expect(at(l, 400).opacity).toBe(1);
  });

  it("labels combinations", () => {
    expect(entranceLabel({ fade: true, move: "slideUp" })).toBe("Fade In + Slide Up");
    expect(entranceLabel({ fade: false, move: "scaleIn" })).toBe("Scale In");
    expect(entranceLabel({ fade: false, move: "none" })).toBe("None");
  });
});

describe("easing", () => {
  it("each easing changes the actual motion, and all reach their end", () => {
    const values = (["linear", "easeIn", "easeOut", "easeInOut", "spring"] as const).map((e) => ease(e, 0.3));
    expect(new Set(values.map((v) => v.toFixed(4))).size).toBe(5);
    for (const e of ["linear", "easeIn", "easeOut", "easeInOut", "spring"] as const) {
      expect(ease(e, 0)).toBeCloseTo(0, 6);
      expect(ease(e, 1)).toBe(1);
    }
  });

  it("Ease Out is faster at the start than Ease In", () => {
    expect(ease("easeOut", 0.25)).toBeGreaterThan(ease("linear", 0.25));
    expect(ease("easeIn", 0.25)).toBeLessThan(ease("linear", 0.25));
    expect(ease("easeInOut", 0.5)).toBeCloseTo(0.5);
  });

  it("Spring overshoots slightly and settles", () => {
    const samples = Array.from({ length: 101 }, (_, i) => ease("spring", i / 100));
    const peak = Math.max(...samples);
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.15);
    expect(Math.abs(ease("spring", 0.95) - 1)).toBeLessThan(0.01);
  });

  it("Spring overshoots movement but never opacity", () => {
    const l = text(
      "a",
      motion({
        entrance: entrance({ fade: true, move: "slideUp", durationMs: 1000, easing: "spring", distance: 100 }),
      }),
    );
    const t = timingOf([l], "a");
    const states = Array.from({ length: 50 }, (_, i) => evaluateMotion(l, t, i * 20));
    expect(Math.min(...states.map((s) => s.translateY))).toBeLessThan(0); // overshoots past rest
    expect(Math.max(...states.map((s) => s.opacity))).toBeLessThanOrEqual(1);
  });

  it("camera motion uses its easing", () => {
    const linear = image(
      "p",
      motion({
        continuous: { ...base.continuous, preset: "slowZoomIn", scaleStart: 1, scaleEnd: 1.1, easing: "linear" },
      }),
    );
    const eased = image(
      "p",
      motion({
        continuous: { ...base.continuous, preset: "slowZoomIn", scaleStart: 1, scaleEnd: 1.1, easing: "easeInOut" },
      }),
    );
    expect(evaluateMotion(linear, timingOf([linear], "p"), 1500).contentScale).toBeCloseTo(1.025);
    expect(evaluateMotion(eased, timingOf([eased], "p"), 1500).contentScale).toBeLessThan(1.025);
  });
});

describe("camera motion & transitions", () => {
  it("Slow Zoom In 100% → 108% over 6s", () => {
    const photo = image(
      "p",
      motion({
        continuous: { ...base.continuous, preset: "slowZoomIn", scaleStart: 1, scaleEnd: 1.08, durationMs: 6000 },
      }),
    );
    const t = timingOf([photo], "p");
    expect(evaluateMotion(photo, t, 0).contentScale).toBeCloseTo(1);
    expect(evaluateMotion(photo, t, 3000).contentScale).toBeCloseTo(1.04);
    expect(evaluateMotion(photo, t, 6000).contentScale).toBeCloseTo(1.08);
  });

  it("pans never reveal the frame edge", () => {
    const photo = image(
      "p",
      motion({ continuous: { ...base.continuous, preset: "panLeft", scaleStart: 1, distance: 108 } }),
    );
    const t = timingOf([photo], "p");
    expect(evaluateMotion(photo, t, 0).contentTranslateX).toBeCloseTo(54);
    expect(evaluateMotion(photo, t, 6000).contentTranslateX).toBeCloseTo(-54);
    expect(cameraCoverage(photo, { width: 1080, height: 1920 }, t).covered).toBe(true);
  });

  it("coverage check flags a zoom-out below 100% and suggests the needed scale", () => {
    const photo = image(
      "p",
      motion({ continuous: { ...base.continuous, preset: "slowZoomOut", scaleStart: 1.08, scaleEnd: 0.9 } }),
    );
    const result = cameraCoverage(photo, { width: 1080, height: 1920 }, timingOf([photo], "p"));
    expect(result.covered).toBe(false);
    expect(result.minScaleNeeded).toBeCloseTo(1 / 0.9, 2);
  });

  it("coverage accounts for photos that overflow the frame (cover crop)", () => {
    // A wide photo in a tall frame is cover-fitted to the frame height, so any zoom below 100% exposes top/bottom.
    const photo = image(
      "p",
      motion({ continuous: { ...base.continuous, preset: "slowZoomOut", scaleStart: 1, scaleEnd: 0.98 } }),
    );
    expect(cameraCoverage(photo, { width: 3000, height: 1000 }, timingOf([photo], "p")).covered).toBe(false);
    // With a static zoom of 110% there is enough spare image for a 98% camera zoom.
    const zoomed = image("p", photo.motion, { zoom: 1.1 });
    expect(cameraCoverage(zoomed, { width: 3000, height: 1000 }, timingOf([zoomed], "p")).covered).toBe(true);
  });

  it("crossfade hides Photo 2 until its start; slide enters from the opposite side", () => {
    const fade = image(
      "b",
      motion({
        delayMs: 2700,
        transition: { preset: "crossfade", durationMs: 800, easing: "linear", direction: "left" },
      }),
    );
    const t = timingOf([fade], "b");
    expect(evaluateMotion(fade, t, 1000).opacity).toBe(0);
    expect(evaluateMotion(fade, t, 3100).opacity).toBeCloseTo(0.5);
    const slide = image(
      "s",
      motion({ transition: { preset: "slide", durationMs: 1000, easing: "linear", direction: "left" } }),
    );
    expect(evaluateMotion(slide, timingOf([slide], "s"), 500).contentTranslateX).toBeCloseTo(540);
    const up = image(
      "u",
      motion({ transition: { preset: "slide", durationMs: 1000, easing: "linear", direction: "up" } }),
    );
    expect(evaluateMotion(up, timingOf([up], "u"), 500).contentTranslateY).toBeCloseTo(960);
  });

  it("zoom transition settles from 125% while fading in", () => {
    const z = image(
      "z",
      motion({ transition: { preset: "zoom", durationMs: 1000, easing: "linear", direction: "left" } }),
    );
    const s = evaluateMotion(z, timingOf([z], "z"), 500);
    expect(s.contentScale).toBeCloseTo(1.125);
    expect(s.opacity).toBeCloseTo(0.5);
  });

  it("is deterministic for the same frame", () => {
    const layer = text("h", motion({ entrance: entrance({ fade: true, move: "scaleIn", durationMs: 700 }) }));
    const t = timingOf([layer], "h");
    expect(evaluateMotion(layer, t, frameToMs(10, 30))).toEqual(evaluateMotion(layer, t, frameToMs(10, 30)));
  });
});

describe("compatibility with saved documents", () => {
  it("frame conversion", () => {
    expect(msToFrames(6000, 30)).toBe(180);
    expect(frameToMs(45, 30)).toBe(1500);
  });

  it.each([
    ["none", { fade: false, move: "none" }],
    ["fadeIn", { fade: true, move: "none" }],
    ["slideUp", { fade: true, move: "slideUp" }],
    ["slideLeft", { fade: true, move: "slideLeft" }],
    ["scaleIn", { fade: true, move: "scaleIn" }],
  ])("legacy entrance preset %s migrates to an identical combination", (preset, expected) => {
    const parsed = motionConfigSchema.parse({ entrance: { preset, durationMs: 600, easing: "easeOutCubic" } });
    expect(parsed.entrance).toMatchObject({ ...expected, durationMs: 600, easing: "easeOut" });
    expect("preset" in parsed.entrance).toBe(false);
  });

  it("legacy cubic easing names map to the same curves", () => {
    const parsed = motionConfigSchema.parse({
      transition: { easing: "easeInOutCubic" },
      exit: { easing: "easeOutCubic" },
    });
    expect(parsed.transition.easing).toBe("easeInOut");
    expect(parsed.exit.easing).toBe("easeOut");
    // Old easeOutCubic: 1 − (1 − t)³.
    expect(ease("easeOut", 0.3)).toBeCloseTo(1 - Math.pow(0.7, 3), 10);
  });

  it("a legacy 'slideUp' layer animates exactly as before (slide + fade)", () => {
    const legacy = motionConfigSchema.parse({
      delayMs: 300,
      entrance: { preset: "slideUp", durationMs: 800, easing: "easeOutCubic", distance: 80 },
    });
    const layer = text("h", legacy);
    const s = evaluateMotion(layer, timingOf([layer], "h"), 700);
    const p = 1 - Math.pow(1 - 0.5, 3);
    expect(s.translateY).toBeCloseTo(80 * (1 - p));
    expect(s.opacity).toBeCloseTo(p);
  });

  it("motion saved before Phase 3 still parses with defaults", () => {
    const parsed = motionConfigSchema.parse({
      sequencing: "sceneStart",
      delayMs: 0,
      holdMs: 0,
      entrance: { preset: "fadeIn" },
      continuous: {},
      exit: {},
    });
    expect(parsed.transition.preset).toBe("none");
    expect(parsed.continuous.easing).toBe("linear");
    expect(parsed.entrance.fade).toBe(true);
  });
});
