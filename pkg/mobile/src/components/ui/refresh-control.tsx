import { RefreshControl as NativeRefreshControl, type RefreshControlProps } from 'react-native';

import { loadingSpinnerColor } from '@/theme/brand-colors';

/** Native pull-to-refresh control using the app variant's existing spinner colour. */
export function RefreshControl(props: RefreshControlProps) {
  return <NativeRefreshControl {...props} colors={[loadingSpinnerColor]} tintColor={loadingSpinnerColor} />;
}
