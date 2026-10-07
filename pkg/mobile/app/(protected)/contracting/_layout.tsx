import { hasBusinessAccess } from '@pkg/domain';
import { type ErrorBoundaryProps, Redirect, Stack } from 'expo-router';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { getSessionRoleSlots, useAuthSession } from '@/lib/auth-session';
import { BUSINESS_HOME } from '@/lib/business-home';
import { useRememberBusiness } from '@/lib/last-business';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AppErrorBoundary error={error} retry={retry} />;
}

export default function ContractingLayout() {
  const allowed = hasBusinessAccess(getSessionRoleSlots(useAuthSession()), 'contracting');
  useRememberBusiness(allowed ? 'contracting' : null);

  if (!allowed) {
    return <Redirect href={BUSINESS_HOME.equipment} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
