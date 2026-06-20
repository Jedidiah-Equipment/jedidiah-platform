import { OverlayProvider } from '@gluestack-ui/overlay';
import { ToastProvider } from '@gluestack-ui/toast';
import type { ReactNode } from 'react';
import { View } from 'react-native';

/**
 * Hosts the gluestack overlay/toast contexts and the app-wide themed background.
 * Colours come from the `global.css` variables via NativeWind classes, so there
 * is no color-mode prop — `bg-background` follows the active scheme on its own.
 */
export function GluestackUIProvider({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1 bg-background">
      <OverlayProvider>
        <ToastProvider>{children}</ToastProvider>
      </OverlayProvider>
    </View>
  );
}
