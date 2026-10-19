import { describe, expect, it } from "vitest";
import { h264Level, measuredBitrateKbps, MP4_SETTINGS } from "./export-settings";

describe("export settings", () => {
  it("standardizes every MP4 on H.264, 30 fps, 5 Mbps, yuv420p", () => {
    expect(MP4_SETTINGS).toMatchObject({
      codec: "h264",
      fps: 30,
      targetBitrateKbps: 5000,
      pixelFormat: "yuv420p",
      profile: "high",
    });
  });

  it("picks a broadly compatible level for each export size", () => {
    expect(h264Level(1080, 1080)).toBe("4.0");
    expect(h264Level(1080, 1920)).toBe("4.0");
    expect(h264Level(1080, 1620)).toBe("4.0");
    expect(h264Level(3840, 2160)).toBe("5.1");
  });

  it("measures bitrate from size and duration", () => {
    expect(measuredBitrateKbps(3_750_000, 6)).toBe(5000);
    expect(measuredBitrateKbps(100, 0)).toBe(0);
  });
});
