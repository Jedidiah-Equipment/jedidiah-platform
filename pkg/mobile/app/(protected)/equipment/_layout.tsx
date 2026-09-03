import { Stack } from 'expo-router';

export default function EquipmentLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="assistant" options={{ presentation: 'modal' }} />
      {/* Keep documents above the tab navigator so the reader remains a full-screen overlay. */}
      <Stack.Screen name="documents/[documentId]" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
