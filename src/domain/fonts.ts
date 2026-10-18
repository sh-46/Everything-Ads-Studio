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
