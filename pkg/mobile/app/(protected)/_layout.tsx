import { Redirect, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { refreshSession, useSession } from '@/lib/auth';
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
 * to /login, and re-resolve the session the moment connectivity returns.
 */
export default function ProtectedLayout() {
  const { data: session, isPending } = useSession();
  const isOffline = useIsOffline();
  const wasOffline = useRef(isOffline);

  useEffect(() => {
    const reconnected = wasOffline.current && !isOffline;
    wasOffline.current = isOffline;
    if (reconnected) void refreshSession();
  }, [isOffline]);

  // Still resolving, or offline with no resolved session: hold (behind the OfflineScreen
  // cover) rather than redirecting on a session fetch we can't trust until we reconnect.
  if (isPending || (!session && isOffline)) {
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
