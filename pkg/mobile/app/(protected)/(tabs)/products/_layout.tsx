import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useCan } from '@/lib/use-access';
import { loadingSpinnerColor } from '@/theme/brand-colors';

/**
 * Owns the Products permission gate for the whole stack, mirroring the session gate
 * in the protected layout: hold while access resolves, redirect users without
 * Product read access, and let every screen below assume it.
 */
export default function ProductsLayout() {
  const access = useCan('product:read');

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
