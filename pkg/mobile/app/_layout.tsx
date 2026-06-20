import '../global.css';

import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { GluestackUIProvider } from '../components/ui/gluestack-ui-provider';
import { useSession } from '../lib/auth';
import { ColorModeProvider } from '../src/theme/ColorModeProvider';

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
          <AuthRedirect />
          <Stack screenOptions={{ headerShown: false }} />
          {/* `auto` tracks the OS bar style; the #518 override hook can drive this later. */}
          <StatusBar style="auto" />
        </GluestackUIProvider>
      </ColorModeProvider>
    </SafeAreaProvider>
  );
}

function AuthRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) return;

    const isLoginRoute = pathname === '/login';

    if (!session && !isLoginRoute) {
      router.replace('/login');
      return;
    }

    if (session && isLoginRoute) {
      router.replace('/');
    }
  }, [isPending, pathname, router, session]);

  return null;
}
