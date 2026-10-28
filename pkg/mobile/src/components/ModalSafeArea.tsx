import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Re-measures the safe area for a Modal's content. A native Modal sits outside the root provider and needs its own. The
 * web portals a Modal inside the page's own React tree, so the page's provider already applies there; a nested one
 * measures the content once, as it mounts mid-slide below the screen, and reports the whole screen as the bottom inset,
 * which squashes the body to nothing.
 */
export function ModalSafeArea({ children }: { children: ReactNode }) {
  return Platform.OS === 'web' ? children : <SafeAreaProvider>{children}</SafeAreaProvider>;
}
