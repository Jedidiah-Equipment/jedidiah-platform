import { OverlayProvider } from '@gluestack-ui/overlay';
import { ToastProvider } from '@gluestack-ui/toast';
import type { ReactNode } from 'react';
import { useColorScheme as useNativeColorScheme, View } from 'react-native';
import { type ColorModePreference, resolveColorModePreference } from '@/theme/color-mode';
import { gluestackConfig } from '@/theme/gluestack-config';

/**
 * Hosts the gluestack overlay/toast contexts and the app-wide themed background.
 * gluestack's documented `mode` prop selects the variable set; the nested view
 * lets semantic classes resolve against that variable context on native.
 */
export function GluestackUIProvider({
  children,
  mode = 'system',
}: {
  children: ReactNode;
  mode?: ColorModePreference;
}) {
  const systemColorScheme = useNativeColorScheme();
  const resolved = resolveColorModePreference(mode, systemColorScheme);

  return (
    <View className="flex-1" style={gluestackConfig[resolved]}>
      <View className="flex-1 bg-background">
        <OverlayProvider>
          <ToastProvider>{children}</ToastProvider>
        </OverlayProvider>
      </View>
    </View>
  );
}
