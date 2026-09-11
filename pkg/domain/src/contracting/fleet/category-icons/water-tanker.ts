import type { CategoryIconGlyph } from '../category-icon-glyph.js';

// Original fleet glyph: Truck with a rounded tank and filler hatch.
export const waterTanker: CategoryIconGlyph = {
  key: 'water-tanker',
  label: 'Water tanker',
  paths: [
    'M3 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M17 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M7 18h10',
    'M5 6h6a3 3 0 0 1 3 3v3a3 3 0 0 1 -3 3H5a3 3 0 0 1 -3 -3V9a3 3 0 0 1 3 -3',
    'M6 6V3h4v3',
    'M14 9h4l3 5h1v4h-1',
    'M15 14h6',
  ],
};
