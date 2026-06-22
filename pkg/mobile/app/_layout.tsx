import '../global.css';

import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineScreen } from '@/components/OfflineScreen';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { ApiProvider } from '@/lib/ApiProvider';
import { apiBaseUrl } from '@/lib/api-base-url';
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

type StartupTestMode = 'fonts' | 'nativewind' | 'providers' | 'root' | 'router' | null;

function getStartupTestMode(): StartupTestMode {
  const value = process.env.EXPO_PUBLIC_MOBILE_TEST_PAGE;

  if (value === '1' || value === 'root') {
    return 'root';
  }

  if (value === '2' || value === 'nativewind') {
    return 'nativewind';
  }

  if (value === '3' || value === 'providers') {
    return 'providers';
  }

  if (value === '4' || value === 'fonts') {
    return 'fonts';
  }

  if (value === '5' || value === 'router') {
    return 'router';
  }

  return null;
}

const startupTestMode = getStartupTestMode();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(geistFonts);

  if (startupTestMode === 'root') {
    return (
      <StartupTestScreen
        body="Root layout is rendering before router, auth, theme, and API providers."
        footnote="EXPO_PUBLIC_MOBILE_TEST_PAGE=root"
        title="Jedidiah Mobile Test"
      />
    );
  }

  if (startupTestMode === 'nativewind') {
    return <NativeWindTestScreen />;
  }

  if (startupTestMode === 'providers') {
    return (
      <SafeAreaProvider>
        <ColorModeProvider>
          <GluestackUIProvider>
            <ConnectivityProvider>
              <ApiProvider>
                <StartupTestScreen
                  body="Provider stack mounted successfully. Router and auth routes are bypassed in this mode."
                  footnote={`API base: ${apiBaseUrl}`}
                  title="Provider Test"
                />
                <ThemedStatusBar />
              </ApiProvider>
            </ConnectivityProvider>
          </GluestackUIProvider>
        </ColorModeProvider>
      </SafeAreaProvider>
    );
  }

  if (!fontsLoaded && !fontError) {
    return <StartupLoader />;
  }

  if (startupTestMode === 'fonts') {
    return (
      <StartupTestScreen
        body="Font gate resolved before providers and router mounted."
        footnote={fontError ? `Font error: ${fontError.message}` : 'EXPO_PUBLIC_MOBILE_TEST_PAGE=fonts'}
        title="Font Test"
      />
    );
  }

  if (startupTestMode === 'router') {
    return (
      <SafeAreaProvider>
        <ColorModeProvider>
          <GluestackUIProvider>
            <ConnectivityProvider>
              <ApiProvider>
                <Stack screenOptions={{ headerShown: false }} />
                <RouterTestRedirect />
                <OfflineScreen />
                <ThemedStatusBar />
              </ApiProvider>
            </ConnectivityProvider>
          </GluestackUIProvider>
        </ColorModeProvider>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ColorModeProvider>
        <GluestackUIProvider>
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
      </ColorModeProvider>
    </SafeAreaProvider>
  );
}

function ThemedStatusBar() {
  const { resolved } = useColorMode();

  return <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />;
}

function RouterTestRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/router-test');
  }, [router]);

  return null;
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

function NativeWindTestScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-7">
      <Text className="mb-3 text-center text-3xl font-bold text-primary">NativeWind Test</Text>
      <Text className="mb-2 text-center text-base leading-6 text-foreground">
        Root layout is rendering with NativeWind className styles.
      </Text>
      <Text className="text-center text-xs leading-5 text-muted-foreground">
        EXPO_PUBLIC_MOBILE_TEST_PAGE=nativewind
      </Text>
    </View>
  );
}

function StartupTestScreen({ body, footnote, title }: { body: string; footnote: string; title: string }) {
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
      <Text style={{ color: '#fff000', fontSize: 30, fontWeight: '800', marginBottom: 12, textAlign: 'center' }}>
        {title}
      </Text>
      <Text style={{ color: '#fafafa', fontSize: 16, lineHeight: 24, marginBottom: 8, textAlign: 'center' }}>
        {body}
      </Text>
      <Text style={{ color: '#7a7a82', fontSize: 13, lineHeight: 20, textAlign: 'center' }}>{footnote}</Text>
    </View>
  );
}
