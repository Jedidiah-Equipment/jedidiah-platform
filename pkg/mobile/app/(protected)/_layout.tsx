import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useSession } from '@/lib/auth';
import { AuthSessionProvider } from '@/lib/auth-session';

/**
 * Owns auth for the whole protected route tree in one place: show a loading
 * state while the session resolves, redirect to /login when there is none, and
 * otherwise expose the resolved session so screens below can assume it (via
 * `useAuthSession`) instead of each repeating a loading/redirect guard.
 */
export default function ProtectedLayout() {
  const { data: session, isPending } = useSession();

  if (isPending) {
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
