/**
 * Converts a `#rrggbb` hex colour to the space-separated `"r g b"` triplet that NativeWind /
 * Tailwind CSS custom properties expect (so `rgb(var(--x) / <alpha>)` opacity modifiers work).
 * Lets the mobile theme derive its `--color-*` vars from the shared hex palette instead of
 * re-typing each colour as a triplet.
 */
export function hexToRgbTriplet(hex: string): string {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  return `${r} ${g} ${b}`;
}
