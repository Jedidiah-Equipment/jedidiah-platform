import { brandForegroundColors } from './brand-colors';
import { useColorMode } from './use-color-mode';

/**
 * The brand accent for whatever the current scheme is painting — spinners, the selected tab, accent
 * icons. Reach for this instead of `loadingSpinnerColor` on any surface that follows the theme; the
 * raw brand yellow only holds up on the splash screens that carry their own dark backdrop.
 */
export function useBrandForegroundColor(): string {
  const { resolved } = useColorMode();

  return brandForegroundColors[resolved];
}
