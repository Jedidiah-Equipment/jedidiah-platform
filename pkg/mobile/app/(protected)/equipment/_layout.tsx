import { Redirect, Stack } from 'expo-router';
import { getSessionBusinessAccess, useAuthSession } from '@/lib/auth-session';

export default function EquipmentLayout() {
  const session = useAuthSession();

  if (!getSessionBusinessAccess(session).equipment) {
    return <Redirect href="/contracting" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="assistant" options={{ presentation: 'modal' }} />
      {/* Keep documents above the tab navigator so the reader remains a full-screen overlay. */}
      <Stack.Screen name="documents/[documentId]" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
