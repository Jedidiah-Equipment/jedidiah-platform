import { darkColors, lightColors } from '@pkg/domain';
import plugin from 'tailwindcss/plugin';

/**
 * Paints `--primary` from the palette mobile also reads, so neither app holds its own copy. It lands in
 * the base layer, so the unlayered staging overrides in `globals.css` still win.
 */
export default plugin(({ addBase }) => {
  addBase({
    ':root': { '--primary': lightColors.primary, '--sidebar-primary': lightColors.primary },
    '.dark': { '--primary': darkColors.primary, '--sidebar-primary': darkColors.primary },
  });
});
