/**
 * Standardized production settings for every MP4 (Motion Tile, Facebook Build, single
 * exports). One definition used by the renderer, the validation step and the UI.
 */
export const MP4_SETTINGS = {
  container: "mp4",
  codec: "h264",
  profile: "high",
  fps: 30,
  /** Target average video bitrate. Encoded bitrate varies with content; it is measured and reported. */
  targetBitrateKbps: 5000,
  /** Peak allowed by the encoder's rate control (VBV), so bitrate stays near the target. */
  maxBitrateKbps: 6000,
  bufferKbits: 10000,
  pixelFormat: "yuv420p",
} as const;

export const PNG_SETTINGS = { format: "png" } as const;

/**
 * Lowest H.264 level that supports the frame size at 30 fps (High profile). 1080×1920
 * is 8,160 macroblocks per frame, which fits Level 4.0 — broadly supported on phones.
 */
export function h264Level(width: number, height: number, fps: number = MP4_SETTINGS.fps): string {
  const mbPerFrame = Math.ceil(width / 16) * Math.ceil(height / 16);
  const mbPerSecond = mbPerFrame * fps;
  const levels: [string, number, number][] = [
    ["4.0", 8192, 245_760],
    ["4.2", 8704, 522_240],
    ["5.1", 36_864, 983_040],
    ["5.2", 36_864, 2_073_600],
  ];
  return levels.find(([, maxFs, maxMbps]) => mbPerFrame <= maxFs && mbPerSecond <= maxMbps)?.[0] ?? "5.2";
}

/** Measured average video bitrate from file size and duration (container overhead is tiny). */
export function measuredBitrateKbps(bytes: number, durationSeconds: number): number {
  return durationSeconds > 0 ? Math.round((bytes * 8) / durationSeconds / 1000) : 0;
}
