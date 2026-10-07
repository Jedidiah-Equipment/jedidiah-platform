import { hasBusinessAccess } from '@pkg/domain';
import { type ErrorBoundaryProps, Redirect, Stack } from 'expo-router';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AssistantProvider } from '@/equipment/components/assistant/AssistantProvider';
import { getSessionRoleSlots, useAuthSession } from '@/lib/auth-session';
import { BUSINESS_HOME } from '@/lib/business-home';
import { useRememberBusiness } from '@/lib/last-business';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AppErrorBoundary error={error} retry={retry} />;
}

export default function EquipmentLayout() {
  const allowed = hasBusinessAccess(getSessionRoleSlots(useAuthSession()), 'equipment');
  useRememberBusiness(allowed ? 'equipment' : null);

  if (!allowed) {
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
