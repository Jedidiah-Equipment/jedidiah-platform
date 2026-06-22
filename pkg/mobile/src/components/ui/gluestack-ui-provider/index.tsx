import { OverlayProvider } from '@gluestack-ui/overlay';
import { ToastProvider } from '@gluestack-ui/toast';
import { vars } from 'nativewind';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useColorMode } from '@/theme/use-color-mode';

const lightThemeVars = vars({
  '--color-background': '247 247 247',
  '--color-border': 'rgb(229 229 229)',
  '--color-danger': '248 113 113',
  '--color-elevated': '245 245 245',
  '--color-foreground': '10 10 10',
  '--color-muted': '245 245 245',
  '--color-muted-foreground': '115 115 115',
  '--color-primary': '248 211 0',
  '--color-primary-foreground': '10 10 10',
  '--color-status-in-progress': '59 130 246',
  '--color-status-next': '34 197 94',
  '--color-status-next-soft': '95 207 135',
  '--color-status-scheduled': '251 191 36',
  '--color-surface': '255 255 255',
  '--color-surface-foreground': '10 10 10',
});

const darkThemeVars = vars({
  '--color-background': '10 10 11',
  '--color-border': 'rgba(255, 255, 255, 0.08)',
  '--color-danger': '248 113 113',
  '--color-elevated': '46 46 52',
  '--color-foreground': '250 250 250',
  '--color-muted': '27 27 31',
  '--color-muted-foreground': '122 122 130',
  '--color-primary': '255 240 0',
  '--color-primary-foreground': '10 10 10',
  '--color-status-in-progress': '96 165 250',
  '--color-status-next': '34 197 94',
  '--color-status-next-soft': '95 207 135',
  '--color-status-scheduled': '251 191 36',
  '--color-surface': '20 20 22',
  '--color-surface-foreground': '250 250 250',
});

/**
 * Hosts the gluestack overlay/toast contexts and the app-wide themed background.
 * NativeWind resolves semantic classes from variables in the nearest native
 * style context, so the root view swaps the token map whenever the resolved
 * colour mode changes.
 */
export function GluestackUIProvider({ children }: { children: ReactNode }) {
  const { resolved } = useColorMode();

  return (
    <View className="flex-1 bg-background" style={resolved === 'dark' ? darkThemeVars : lightThemeVars}>
      <OverlayProvider>
        <ToastProvider>{children}</ToastProvider>
      </OverlayProvider>
    </View>
  );
}
