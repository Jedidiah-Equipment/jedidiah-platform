import { RefreshControl as NativeRefreshControl, type RefreshControlProps } from 'react-native';

import { useBrandForegroundColor } from '@/theme/use-brand-foreground';

/** Native pull-to-refresh control tinted by the brand accent for the scheme currently painting. */
export function RefreshControl(props: Omit<RefreshControlProps, 'colors' | 'tintColor'>) {
  const color = useBrandForegroundColor();

  return <NativeRefreshControl {...props} colors={[color]} tintColor={color} />;
}
