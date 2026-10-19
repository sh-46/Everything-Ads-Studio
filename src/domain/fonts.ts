/**
 * Font families available before brand font upload exists (Milestone 2).
 * These are system families so the canvas never draws with a font that hasn't loaded.
 */
export const SYSTEM_FONT_FAMILIES = [
  "Helvetica Neue",
  "Arial",
  "Avenir Next",
  "Futura",
  "Gill Sans",
  "Georgia",
  "Times New Roman",
  "Courier New",
] as const;

export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/**
 * The font stack every renderer uses for a family (Konva canvas `font`, Remotion CSS,
 * future MP4 worker), so fallbacks are identical everywhere.
 */
export function fontStack(family: string): string {
  const safe = family.replace(/["\\]/g, "");
  return `"${safe}", "Helvetica Neue", Arial, sans-serif`;
}

export function isSystemFont(family: string): boolean {
  return (SYSTEM_FONT_FAMILIES as readonly string[]).includes(family);
}
