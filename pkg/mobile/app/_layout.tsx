import '../global.css';

import { useFonts } from 'expo-font';
import { type ErrorBoundaryProps, Stack, usePathname, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { OfflineScreen } from '@/components/OfflineScreen';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { CONTRACTING_SCREEN_CATALOG } from '@/contracting/screen-catalog';
import { EQUIPMENT_MUTATION_EVENTS } from '@/equipment/observability';
import { EQUIPMENT_SCREEN_CATALOG } from '@/equipment/screen-catalog';
import { ApiProvider } from '@/lib/ApiProvider';
import { isOfflineCapableRoute } from '@/lib/business-home';
import { ConnectivityProvider } from '@/lib/connectivity';
import { initializeObservability, trackScreen } from '@/lib/observability';
import { createScreenResolver, SHARED_SCREEN_CATALOG } from '@/lib/screen-catalog';
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

initializeObservability();
const screenForSegments = createScreenResolver([
  SHARED_SCREEN_CATALOG,
  CONTRACTING_SCREEN_CATALOG,
  EQUIPMENT_SCREEN_CATALOG,
]);

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AppErrorBoundary error={error} retry={retry} />;
}

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
        <ApiProvider mutationEvents={EQUIPMENT_MUTATION_EVENTS}>
          {/* Auth gating lives in app/(protected)/_layout.tsx; login is the public route. */}
          <Stack screenOptions={{ headerShown: false }} />
          <RouteObservability />
          {/* Offline-capable business routes (Contracting field capture) stay available while disconnected. */}
          <OfflineGate />
          {/* Single update prompt: offers a downloaded new version wherever the user is. */}
          <UpdatePrompt />
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

function OfflineGate() {
  const pathname = usePathname();
  const allowOffline = isOfflineCapableRoute(pathname);
  return <OfflineScreen allowOffline={allowOffline} />;
}

function RouteObservability() {
  const segments = useSegments();
  const key = segments.join('/');

  useEffect(() => {
    const screen = screenForSegments(key ? key.split('/') : []);
    if (screen) trackScreen(screen);
  }, [key]);

  return null;
}
