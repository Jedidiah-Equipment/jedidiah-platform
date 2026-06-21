import type { Icon as TablerIcon } from '@tabler/icons-react-native';
import { cssInterop } from 'nativewind';

/**
 * Renders a Tabler icon (same set as web's `@tabler/icons-react`) themed by a
 * NativeWind class. Tabler RN icons paint from their `color` prop, so `cssInterop`
 * moves the class's resolved colour onto that prop — keeping icons on the semantic
 * tokens in `global.css` (and dark mode) without branching on the scheme in JS
 * (see pkg/mobile/AGENTS.md).
 */

// `cssInterop` returns a wrapped component; register each Tabler icon once.
const styledIcons = new WeakMap<TablerIcon, TablerIcon>();

function styledIcon(icon: TablerIcon): TablerIcon {
  const cached = styledIcons.get(icon);
  if (cached) return cached;

  const styled = cssInterop(icon, {
    className: { target: 'style', nativeStyleToProp: { color: true } },
  }) as unknown as TablerIcon;
  styledIcons.set(icon, styled);
  return styled;
}

export function Icon({
  icon,
  className = 'text-foreground',
  size = 20,
  strokeWidth = 2,
}: {
  icon: TablerIcon;
  /** NativeWind text colour class, e.g. `text-muted-foreground`. */
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const Styled = styledIcon(icon);

  return <Styled className={className} size={size} strokeWidth={strokeWidth} />;
}
