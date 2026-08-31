import { type ActivityIndicatorProps, ActivityIndicator as NativeActivityIndicator } from 'react-native';

import { useBrandForegroundColor } from '@/theme/use-brand-foreground';

/**
 * Brand-tinted spinner for any surface the theme paints. The accent follows the active scheme, so a
 * light-mode screen never spins the raw brand yellow against near-white. The splash screens that
 * carry their own hard-coded dark backdrop use React Native's `ActivityIndicator` directly.
 */
export function ActivityIndicator(props: ActivityIndicatorProps) {
  const color = useBrandForegroundColor();

  return <NativeActivityIndicator color={color} {...props} />;
}
