// Highlight palettes. Each colour-plan page shows up to 4 groups, so any 4
// consecutive entries must be clearly distinguishable.

/** Default colour-plan order: vivid "highlighter" green, yellow, red, blue. */
export const STANDARD_PALETTE = [
  '#2fd92f', // green
  '#ffe600', // yellow
  '#ff2424', // red
  '#1f9dff', // blue
];

/** Bright, saturated colours. */
export const BRIGHT_PALETTE = [
  '#1e6fff', // blue
  '#ff3b30', // red
  '#34c759', // green
  '#ff9500', // orange
  '#af52de', // purple
  '#00c7be', // teal
  '#ffcc00', // yellow
  '#ff2d55', // pink
];

/** Okabe-Ito colour-blind-safe palette. */
export const CB_SAFE_PALETTE = [
  '#0072b2', // blue
  '#d55e00', // vermillion
  '#009e73', // green
  '#cc79a7', // reddish purple
  '#e69f00', // orange
  '#56b4e9', // sky blue
  '#f0e442', // yellow
  '#000000', // black
];

export type PaletteName = 'standard' | 'bright' | 'cbSafe';

export function getPalette(name: PaletteName): string[] {
  if (name === 'standard') return STANDARD_PALETTE;
  if (name === 'cbSafe') return CB_SAFE_PALETTE;
  return BRIGHT_PALETTE;
}

export function colourAt(palette: string[], index: number): string {
  return palette[index % palette.length];
}
