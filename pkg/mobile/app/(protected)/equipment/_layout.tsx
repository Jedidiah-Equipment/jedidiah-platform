import { hasBusinessAccess } from '@pkg/domain';
import { Redirect, Stack } from 'expo-router';
import { AssistantProvider } from '@/equipment/components/assistant/AssistantProvider';
import { getSessionRoleSlots, useAuthSession } from '@/lib/auth-session';
import { BUSINESS_HOME } from '@/lib/business-home';

export default function EquipmentLayout() {
  const session = useAuthSession();

  if (!hasBusinessAccess(getSessionRoleSlots(session), 'equipment')) {
    return <Redirect href={BUSINESS_HOME.contracting} />;
  }

  return (
    <AssistantProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="assistant" options={{ presentation: 'modal' }} />
        {/* Keep documents above the tab navigator so the reader remains a full-screen overlay. */}
        <Stack.Screen name="documents/[documentId]" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </AssistantProvider>
  );
}
