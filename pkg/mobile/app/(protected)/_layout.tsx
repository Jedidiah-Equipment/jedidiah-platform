import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useSession } from '@/lib/auth';
import { AuthSessionProvider } from '@/lib/auth-session';
import { useIsOffline } from '@/lib/connectivity';

/**
 * Owns auth for the whole protected route tree in one place: show a loading
 * state while the session resolves, redirect to /login when there is none, and
 * otherwise expose the resolved session so screens below can assume it (via
 * `useAuthSession`) instead of each repeating a loading/redirect guard.
 *
 * Offline-aware so the app-wide OfflineScreen cover can't hide a wrong auth decision:
 * `useSession`'s fetch fails offline, so we hold rather than bounce a signed-in operator
 * to /login, and keep holding through the reconnect until the session refetch resolves.
 */
export default function ProtectedLayout() {
  const { data: session, isPending, refetch } = useSession();
  const isOffline = useIsOffline();

  // Track offline→online transitions in render-safe state (not a ref-in-effect) so the hold
  // below engages on the very render that would otherwise fall through to <Redirect>: an effect
  // runs only after Redirect has mounted and Expo Router has already navigated to /login.
  const [prevOffline, setPrevOffline] = useState(isOffline);
  const [reconnecting, setReconnecting] = useState(false);
  if (prevOffline !== isOffline) {
    setPrevOffline(isOffline);
    // Back online without a resolved session: hold and refetch instead of bouncing to /login.
    if (prevOffline && !isOffline && !session) setReconnecting(true);
  }

  useEffect(() => {
    if (!reconnecting) return;
    let active = true;
    // Refetch through the hook (not a standalone authClient.getSession(), which doesn't update
    // useSession's store) so the recovered session re-renders this gate; release the hold only
    // once it settles — whether it restored a session or confirmed there genuinely is none.
    void refetch().finally(() => {
      if (active) setReconnecting(false);
    });
    return () => {
      active = false;
    };
  }, [reconnecting, refetch]);

  // Still resolving, offline with no resolved session, or reconnecting after coming back online:
  // hold (behind the OfflineScreen cover) rather than redirecting on a session we can't yet trust.
  if (isPending || reconnecting || (!session && isOffline)) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 justify-center px-7 py-10">
          <Text className="text-base leading-6 text-muted-foreground">Checking session</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  return (
    <AuthSessionProvider session={session}>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthSessionProvider>
  );
}
