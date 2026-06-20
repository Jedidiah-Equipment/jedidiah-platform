import '../global.css';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { ColorModeProvider } from '@/theme/ColorModeProvider';

// Geist app font (same faces as web's @pkg/domain/fonts/geist-sans; vendored here
// because Metro can't resolve a workspace package's asset subpath). Each weight is
// its own family (see tailwind.config.js fontFamily) since RN needs a real face.
const geistFonts = {
  Geist: require('../assets/fonts/Geist-Regular.ttf'),
  'Geist-SemiBold': require('../assets/fonts/Geist-SemiBold.ttf'),
  'Geist-Bold': require('../assets/fonts/Geist-Bold.ttf'),
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(geistFonts);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ColorModeProvider>
        <GluestackUIProvider>
          {/* Auth gating lives in app/(protected)/_layout.tsx; login is the public route. */}
          <Stack screenOptions={{ headerShown: false }} />
          {/* `auto` tracks the OS bar style; the #518 override hook can drive this later. */}
          <StatusBar style="auto" />
        </GluestackUIProvider>
      </ColorModeProvider>
    </SafeAreaProvider>
  );
}
