import type { Icon as TablerIcon } from '@tabler/icons-react-native';

import { useColorMode } from '@/theme/use-color-mode';

/**
 * Renders a Tabler icon (same set as web's `@tabler/icons-react`) with a themed
 * stroke colour. Tabler RN icons draw with `currentColor`, but react-native-svg
 * can't resolve that from a NativeWind class, so the colour is passed explicitly
 * here — the values mirror the semantic tokens in `global.css` per scheme.
 */
const ICON_COLORS = {
  foreground: { light: '#0a0a0a', dark: '#fafafa' },
  'muted-foreground': { light: '#737373', dark: '#7a7a82' },
  primary: { light: '#f8d300', dark: '#fff000' },
  danger: { light: '#f87171', dark: '#f87171' },
} as const;

export type IconColor = keyof typeof ICON_COLORS;

export function Icon({
  icon: TablerComponent,
  size = 20,
  color = 'foreground',
  strokeWidth = 2,
}: {
  icon: TablerIcon;
  size?: number;
  color?: IconColor;
  strokeWidth?: number;
}) {
  const { resolved } = useColorMode();

  return <TablerComponent color={ICON_COLORS[color][resolved]} size={size} strokeWidth={strokeWidth} />;
}
