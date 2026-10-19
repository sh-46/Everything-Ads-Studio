/**
 * Word wrapping shared by the disclosure checks. Mirrors how the editor (Konva
 * `wrap="word"`) and the preview/export (CSS `overflow-wrap: break-word`) break lines:
 * explicit newlines first, then whole words, splitting a word only if it can't fit.
 */

export interface TextMetricsStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  lineHeight: number;
}

/** Width of `text` in scene pixels. */
export type MeasureText = (text: string, style: TextMetricsStyle) => number;

/**
 * Font-independent estimate (no DOM), used on the server. Average sans-serif glyphs are
 * ~0.5 em wide; bold runs wider. Deliberately a little generous so clipping warnings err
 * on the side of caution.
 */
export const estimateTextWidth: MeasureText = (text, style) => {
  const em = 0.52 + Math.max(0, style.fontWeight - 400) / 4000;
  return text.length * style.fontSize * em + Math.max(0, text.length - 1) * style.letterSpacing;
};

export function wrapTextLines(
  text: string,
  maxWidth: number,
  style: TextMetricsStyle,
  measure: MeasureText = estimateTextWidth,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, style) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
      // A single word wider than the box breaks by character.
      while (measure(line, style) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut), style) > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Height of the wrapped text block, as laid out with `lineHeight`. */
export function textBlockHeight(
  text: string,
  maxWidth: number,
  style: TextMetricsStyle,
  measure: MeasureText = estimateTextWidth,
): number {
  return wrapTextLines(text, maxWidth, style, measure).length * style.fontSize * style.lineHeight;
}

/** Browser measurement with a canvas (same font stack the renderers use). */
export function canvasMeasure(fontStack: (family: string) => string): MeasureText | undefined {
  if (typeof document === "undefined") return undefined;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return undefined;
  return (text, style) => {
    context.font = `${style.fontWeight} ${style.fontSize}px ${fontStack(style.fontFamily)}`;
    return context.measureText(text).width + Math.max(0, text.length - 1) * style.letterSpacing;
  };
}
