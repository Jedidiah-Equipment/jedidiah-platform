import '../global.css';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineScreen } from '@/components/OfflineScreen';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { ApiProvider } from '@/lib/ApiProvider';
import { ConnectivityProvider } from '@/lib/connectivity';
import { ColorModeProvider } from '@/theme/ColorModeProvider';
import { useColorMode } from '@/theme/use-color-mode';

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
    return <StartupLoader />;
  }

  return (
    <SafeAreaProvider>
      <ColorModeProvider>
        <ThemedAppShell />
      </ColorModeProvider>
    </SafeAreaProvider>
  );
}

function ThemedAppShell() {
  const { preference } = useColorMode();

  return (
    <GluestackUIProvider mode={preference}>
      <ConnectivityProvider>
        <ApiProvider>
          {/* Auth gating lives in app/(protected)/_layout.tsx; login is the public route. */}
          <Stack screenOptions={{ headerShown: false }} />
          {/* Single offline gate: covers the whole app while offline, so no screen checks connectivity. */}
          <OfflineScreen />
          <ThemedStatusBar />
        </ApiProvider>
      </ConnectivityProvider>
    </GluestackUIProvider>
  );
}

function ThemedStatusBar() {
  const { resolved } = useColorMode();

  return <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />;
}

function StartupLoader() {
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: '#0a0a0b',
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 28,
      }}
    >
      <ActivityIndicator accessibilityLabel="Loading app" color="#fff000" size="large" />
      <Text style={{ color: '#fafafa', fontSize: 16, lineHeight: 24, marginTop: 16, textAlign: 'center' }}>
        Loading app
      </Text>
      <Text style={{ color: '#7a7a82', fontSize: 13, lineHeight: 20, marginTop: 6, textAlign: 'center' }}>
        Loading fonts before startup.
      </Text>
    </View>
  );
}
