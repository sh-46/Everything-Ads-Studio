import { z } from "zod";

export const hexColorSchema = z.string().regex(/^#([0-9a-fA-F]{6})$/, "Expected a #RRGGBB color");

export type HexColor = z.infer<typeof hexColorSchema>;

/** Converts `#RRGGBB` plus an opacity (0–1) into a CSS/canvas `rgba()` string. */
export function hexToRgba(hex: string, opacity = 1): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const a = Math.min(1, Math.max(0, opacity));
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(4))})`;
}
