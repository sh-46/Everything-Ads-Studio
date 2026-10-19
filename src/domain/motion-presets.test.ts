import { describe, expect, it } from "vitest";
import { defaultMotion } from "./motion";
import { applyMotionPreset, motionPresetListSchema, presetMotionFrom, STARTER_PRESETS } from "./motion-presets";
import { makeLayer, type ImageLayer, type TextLayer } from "./scene";

const headline = makeLayer<TextLayer>({
  type: "text",
  name: "Headline",
  text: "x",
  fontFamily: "Arial",
  fontSize: 40,
  fontWeight: 700,
  letterSpacing: 0,
  lineHeight: 1.2,
  color: "#FFFFFF",
  align: "left",
  x: 0,
  y: 0,
  width: 100,
  height: 40,
});
const photo2 = makeLayer<ImageLayer>({
  type: "image",
  name: "Photo 2",
  assetId: null,
  fit: "cover",
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  motion: {
    ...defaultMotion(),
    transition: { preset: "slide", durationMs: 900, easing: "easeInOut", direction: "up" },
  },
});

describe("motion presets", () => {
  it("starter presets cover the requested examples", () => {
    expect(STARTER_PRESETS.map((p) => p.name)).toEqual([
      "Headline — Fade In + Slide Up",
      "Subtitle — Delayed Fade In",
      "Vehicle Photo — Slow Zoom In",
      "Logo — Fade In",
    ]);
  });

  it("applying copies timing and entrance; camera motion only to photos/logos", () => {
    const zoom = STARTER_PRESETS[2];
    const onText = applyMotionPreset(headline, zoom);
    expect(onText.continuous).toEqual(headline.motion.continuous);
    const onPhoto = applyMotionPreset(photo2, zoom);
    expect(onPhoto.continuous.preset).toBe("slowZoomIn");
  });

  it("applying never touches a photo's transition", () => {
    const applied = applyMotionPreset(photo2, STARTER_PRESETS[0]);
    expect(applied.transition).toEqual(photo2.motion.transition);
    expect(applied.entrance).toMatchObject({ fade: true, move: "slideUp" });
  });

  it("presets are copies, not live links", () => {
    const preset = { ...STARTER_PRESETS[0], motion: presetMotionFrom(headline) };
    const applied = applyMotionPreset(headline, preset);
    preset.motion.delayMs = 9999;
    expect(applied.delayMs).not.toBe(9999);
  });

  it("invalid stored lists fall back to empty", () => {
    expect(motionPresetListSchema.parse("garbage")).toEqual([]);
    expect(
      motionPresetListSchema.parse([{ id: "x", name: "Old", motion: { entrance: { preset: "fadeIn" } } }])[0].motion
        .entrance.fade,
    ).toBe(true);
  });
});
