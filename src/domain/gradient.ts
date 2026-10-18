import { z } from "zod";
import { hexColorSchema } from "./color";

export const gradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: hexColorSchema,
  opacity: z.number().min(0).max(1).default(1),
});

export type GradientStop = z.infer<typeof gradientStopSchema>;

/**
 * Gradient definition shared by gradient layers and brand kit presets.
 * `angle` follows CSS `linear-gradient` semantics: 0° points up, 90° points right.
 * Radial gradients are circles centered in the box reaching the farthest corner
 * (CSS: `radial-gradient(circle farthest-corner at center, …)`).
 */
export const gradientFillSchema = z.object({
  gradientType: z.enum(["linear", "radial"]).default("linear"),
  angle: z.number().min(-360).max(360).default(180),
  stops: z.array(gradientStopSchema).min(2).max(8),
});

export type GradientFill = z.infer<typeof gradientFillSchema>;
