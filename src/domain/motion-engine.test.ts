import { describe, expect, it } from "vitest";
import { defaultMotion, motionConfigSchema, type MotionConfig } from "./motion";
import { computeSceneTimings, ease, evaluateMotion, frameToMs, msToFrames } from "./motion-engine";
import { makeLayer, type ImageLayer, type Layer, type TextLayer } from "./scene";

const motion = (patch: Partial<MotionConfig> = {}): MotionConfig => ({ ...defaultMotion(), ...patch });

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

const image = (id: string, m: MotionConfig): ImageLayer =>
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
  });

const timingOf = (layers: Layer[], id: string, duration = 6000) => computeSceneTimings(layers, duration).get(id)!;

describe("timing & sequencing", () => {
  it("Slide Up with 0.3s delay and 0.8s duration", () => {
    const headline = text(
      "h",
      motion({ delayMs: 300, entrance: { ...defaultMotion().entrance, preset: "slideUp", durationMs: 800 } }),
    );
    const t = timingOf([headline], "h");
    expect(t.start).toBe(300);
    expect(t.entranceEnd).toBe(1100);
  });

  it("With previous / After previous chain off the layer below", () => {
    const a = text(
      "a",
      motion({ delayMs: 200, entrance: { ...defaultMotion().entrance, preset: "fadeIn", durationMs: 500 } }),
    );
    const b = text(
      "b",
      motion({
        sequencing: "withPrevious",
        delayMs: 100,
        entrance: { ...defaultMotion().entrance, preset: "fadeIn", durationMs: 400 },
      }),
    );
    const c = text(
      "c",
      motion({
        sequencing: "afterPrevious",
        delayMs: 50,
        entrance: { ...defaultMotion().entrance, preset: "fadeIn", durationMs: 300 },
      }),
    );
    const timings = computeSceneTimings([a, b, c], 6000);
    expect(timings.get("b")!.start).toBe(300); // a.start 200 + 100
    expect(timings.get("c")!.start).toBe(750); // b.entranceEnd 700 + 50
  });

  it("hidden layers don't take part in sequencing", () => {
    const a = text("a", motion({ delayMs: 1000 }));
    const hidden = { ...text("x", motion({ delayMs: 5000 })), visible: false };
    const b = text("b", motion({ sequencing: "withPrevious" }));
    expect(computeSceneTimings([a, hidden, b], 6000).get("b")!.start).toBe(1000);
  });

  it("exit with hold 0 finishes at the scene end; with hold it follows the entrance", () => {
    const base = defaultMotion();
    const atEnd = text("e", motion({ exit: { ...base.exit, preset: "fadeOut", durationMs: 400 } }));
    expect(timingOf([atEnd], "e")).toMatchObject({ exitStart: 5600, exitEnd: 6000 });
    const held = text(
      "h",
      motion({
        holdMs: 1000,
        entrance: { ...base.entrance, preset: "fadeIn", durationMs: 500 },
        exit: { ...base.exit, preset: "fadeOut", durationMs: 400 },
      }),
    );
    expect(timingOf([held], "h")).toMatchObject({ exitStart: 1500, exitEnd: 1900 });
  });
});

describe("evaluateMotion", () => {
  it("Slide Up moves from +distance to rest and fades in", () => {
    const layer = text(
      "h",
      motion({
        delayMs: 300,
        entrance: { ...defaultMotion().entrance, preset: "slideUp", durationMs: 800, distance: 80, easing: "linear" },
      }),
    );
    const t = timingOf([layer], "h");
    expect(evaluateMotion(layer, t, 0)).toMatchObject({ translateY: 80, opacity: 0 });
    expect(evaluateMotion(layer, t, 700)).toMatchObject({ translateY: 40, opacity: 0.5 });
    expect(evaluateMotion(layer, t, 1100)).toMatchObject({ translateY: 0, opacity: 1 });
  });

  it("Slow Zoom In 100% → 108% over 6s", () => {
    const photo = image(
      "p",
      motion({
        continuous: {
          ...defaultMotion().continuous,
          preset: "slowZoomIn",
          scaleStart: 1,
          scaleEnd: 1.08,
          durationMs: 6000,
        },
      }),
    );
    const t = timingOf([photo], "p");
    expect(evaluateMotion(photo, t, 0).contentScale).toBeCloseTo(1);
    expect(evaluateMotion(photo, t, 3000).contentScale).toBeCloseTo(1.04);
    expect(evaluateMotion(photo, t, 6000).contentScale).toBeCloseTo(1.08);
    expect(evaluateMotion(photo, t, 6000).opacity).toBe(1);
  });

  it("pans never reveal the frame edge", () => {
    const photo = image(
      "p",
      motion({ continuous: { ...defaultMotion().continuous, preset: "panLeft", scaleStart: 1, distance: 108 } }),
    );
    const t = timingOf([photo], "p");
    const start = evaluateMotion(photo, t, 0);
    const end = evaluateMotion(photo, t, 6000);
    expect(start.contentTranslateX).toBeCloseTo(54);
    expect(end.contentTranslateX).toBeCloseTo(-54);
    // Scaled width must cover frame width plus the travel.
    expect(start.contentScale * 1080).toBeGreaterThanOrEqual(1080 + 108 - 0.001);
  });

  it("crossfade transition hides the second photo until its start", () => {
    const second = image(
      "b",
      motion({
        delayMs: 2700,
        transition: { preset: "crossfade", durationMs: 800, easing: "linear", direction: "left" },
      }),
    );
    const t = timingOf([second], "b");
    expect(evaluateMotion(second, t, 1000).opacity).toBe(0);
    expect(evaluateMotion(second, t, 3100).opacity).toBeCloseTo(0.5);
    expect(evaluateMotion(second, t, 4000).opacity).toBe(1);
  });

  it("slide transition enters from the opposite side of its direction", () => {
    const second = image(
      "b",
      motion({ transition: { preset: "slide", durationMs: 1000, easing: "linear", direction: "left" } }),
    );
    const t = timingOf([second], "b");
    expect(evaluateMotion(second, t, 500).contentTranslateX).toBeCloseTo(540);
  });

  it("no entrance = visible from its start time (a cut)", () => {
    const layer = text("a", motion({ delayMs: 1000 }));
    const t = timingOf([layer], "a");
    expect(evaluateMotion(layer, t, 999).opacity).toBe(0);
    expect(evaluateMotion(layer, t, 1000).opacity).toBe(1);
  });

  it("is deterministic for the same frame", () => {
    const layer = text("h", motion({ entrance: { ...defaultMotion().entrance, preset: "scaleIn", durationMs: 700 } }));
    const t = timingOf([layer], "h");
    expect(evaluateMotion(layer, t, frameToMs(10, 30))).toEqual(evaluateMotion(layer, t, frameToMs(10, 30)));
  });
});

describe("helpers", () => {
  it("easing endpoints and frame conversion", () => {
    for (const e of ["linear", "easeIn", "easeOut", "easeInOut", "easeOutCubic", "easeInOutCubic"] as const) {
      expect(ease(e, 0)).toBe(0);
      expect(ease(e, 1)).toBe(1);
    }
    expect(msToFrames(6000, 30)).toBe(180);
    expect(frameToMs(45, 30)).toBe(1500);
  });

  it("motion saved before Phase 3 still parses with defaults", () => {
    const old = {
      sequencing: "sceneStart",
      delayMs: 0,
      holdMs: 0,
      entrance: { preset: "fadeIn" },
      continuous: {},
      exit: {},
    };
    const parsed = motionConfigSchema.parse(old);
    expect(parsed.transition.preset).toBe("none");
    expect(parsed.exit.direction).toBe("up");
    expect(parsed.continuous.durationMs).toBe(0);
  });
});
