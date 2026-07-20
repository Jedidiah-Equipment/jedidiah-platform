import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useCan } from '@/lib/use-access';
import { loadingSpinnerColor } from '@/theme/brand-colors';

/** Owns the Quotes permission gate so every screen in the stack can assume Quote read access. */
export default function QuotesLayout() {
  const access = useCan('quote:read');

  if (access.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Checking access" color={loadingSpinnerColor} size="large" />
      </View>
    );
  }

  if (!access.can) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
