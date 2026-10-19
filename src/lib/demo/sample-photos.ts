import "server-only";

/**
 * Generated placeholder "photos" for Demo Mode. They are illustrations, not real vehicle
 * photography, and are visibly labeled SAMPLE so they can't be mistaken for OEM assets.
 */

export interface SamplePhoto {
  key: string;
  filename: string;
  width: number;
  height: number;
  dataUrl: string;
}

function svg(label: string, width: number, height: number, sky: [string, string], floor: string, body: string): string {
  const horizon = Math.round(height * 0.62);
  const carW = width * 0.62;
  const carX = (width - carW) / 2;
  const carY = horizon - carW * 0.2;
  const s = carW / 1000;
  // Stylized SUV silhouette, drawn in a 1000-wide box and scaled into place.
  const path =
    "M40 300 C40 250 70 230 120 220 L260 205 C320 140 380 95 470 85 L720 85 C790 85 830 120 870 190 L930 205 C965 215 975 240 975 270 L975 300 Z";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${floor}"/><stop offset="1" stop-color="#050506"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.62" r="0.5"><stop offset="0" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${width}" height="${horizon}" fill="url(#sky)"/>
  <rect y="${horizon}" width="${width}" height="${height - horizon}" fill="url(#floor)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <ellipse cx="${width / 2}" cy="${horizon + 8 * s}" rx="${carW * 0.52}" ry="${carW * 0.035}" fill="#000" opacity="0.55"/>
  <g transform="translate(${carX} ${carY}) scale(${s})">
    <path d="${path}" fill="${body}"/>
    <path d="M300 205 C350 150 400 115 470 108 L700 108 C760 108 790 140 820 195 Z" fill="#0d0f12" opacity="0.85"/>
    <circle cx="230" cy="300" r="62" fill="#0b0b0c"/><circle cx="230" cy="300" r="34" fill="#3a3d42"/>
    <circle cx="790" cy="300" r="62" fill="#0b0b0c"/><circle cx="790" cy="300" r="34" fill="#3a3d42"/>
  </g>
  <text x="${width / 2}" y="${height * 0.1}" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="${Math.round(width * 0.022)}" font-weight="700" letter-spacing="4" fill="#ffffff" opacity="0.75">SAMPLE PHOTO · ${label.toUpperCase()}</text>
  <text x="${width / 2}" y="${height * 0.1 + width * 0.03}" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="${Math.round(width * 0.014)}" fill="#ffffff" opacity="0.5">Demo Mode placeholder · ${width}×${height}</text>
</svg>`;
}

function interiorSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b2420"/><stop offset="1" stop-color="#0c0a09"/></linearGradient>
    <linearGradient id="seat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a3c"/><stop offset="1" stop-color="#3d2518"/></linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="${width * 0.05}" y="${height * 0.18}" width="${width * 0.9}" height="${height * 0.16}" rx="${width * 0.02}" fill="#1a1716"/>
  <rect x="${width * 0.42}" y="${height * 0.2}" width="${width * 0.16}" height="${height * 0.11}" rx="${width * 0.008}" fill="#26384a"/>
  <circle cx="${width * 0.24}" cy="${height * 0.42}" r="${width * 0.11}" fill="none" stroke="#0e0d0c" stroke-width="${width * 0.022}"/>
  <path d="M${width * 0.08} ${height} L${width * 0.12} ${height * 0.55} Q${width * 0.24} ${height * 0.48} ${width * 0.36} ${height * 0.55} L${width * 0.4} ${height} Z" fill="url(#seat)"/>
  <path d="M${width * 0.6} ${height} L${width * 0.64} ${height * 0.55} Q${width * 0.76} ${height * 0.48} ${width * 0.88} ${height * 0.55} L${width * 0.92} ${height} Z" fill="url(#seat)"/>
  <text x="${width / 2}" y="${height * 0.1}" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="${Math.round(width * 0.022)}" font-weight="700" letter-spacing="4" fill="#ffffff" opacity="0.75">SAMPLE PHOTO · INTERIOR</text>
  <text x="${width / 2}" y="${height * 0.1 + width * 0.03}" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="${Math.round(width * 0.014)}" fill="#ffffff" opacity="0.5">Demo Mode placeholder · ${width}×${height}</text>
</svg>`;
}

function toDataUrl(markup: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(markup).toString("base64")}`;
}

function photo(key: string, filename: string, width: number, height: number, markup: string): SamplePhoto {
  return { key, filename, width, height, dataUrl: toDataUrl(markup) };
}

export function acuraSamplePhotos(): SamplePhoto[] {
  return [
    photo(
      "exterior-front",
      "sample-mdx-exterior-front.svg",
      2400,
      1600,
      svg("Exterior front", 2400, 1600, ["#1c2430", "#5b6b7d"], "#1b1d21", "#7d1f22"),
    ),
    photo(
      "exterior-side",
      "sample-mdx-exterior-side.svg",
      2400,
      1600,
      svg("Exterior side", 2400, 1600, ["#2f2a3a", "#c27b56"], "#26201d", "#9aa0a6"),
    ),
    photo("interior", "sample-mdx-interior.svg", 2400, 1600, interiorSvg(2400, 1600)),
    photo(
      "performance",
      "sample-mdx-performance.svg",
      2400,
      1600,
      svg("Performance", 2400, 1600, ["#06070a", "#20262f"], "#101114", "#c8102e"),
    ),
    photo(
      "vertical-hero",
      "sample-mdx-vertical-hero.svg",
      1600,
      2400,
      svg("Vertical hero", 1600, 2400, ["#0e1622", "#3a4a5c"], "#141518", "#e5e5e5"),
    ),
  ];
}

export function hondaSamplePhotos(): SamplePhoto[] {
  return [
    photo(
      "exterior",
      "sample-pilot-exterior.svg",
      2400,
      1600,
      svg("Exterior", 2400, 1600, ["#203040", "#8fb3cf"], "#2a2c30", "#24384f"),
    ),
  ];
}

/** A plain text wordmark clearly labeled as a sample — not an OEM logo design. */
export function sampleLogo(name: string, color: string): SamplePhoto {
  const width = 900;
  const height = 220;
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="${width / 2}" y="130" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="120" font-weight="700" letter-spacing="24" fill="${color}">${name}</text>
  <text x="${width / 2}" y="200" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" font-size="34" letter-spacing="10" fill="${color}" opacity="0.6">SAMPLE LOGO</text>
</svg>`;
  return photo(`logo-${name.toLowerCase()}`, `sample-${name.toLowerCase()}-logo.svg`, width, height, markup);
}
