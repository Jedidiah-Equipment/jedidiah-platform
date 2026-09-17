import { hasBusinessAccess } from '@pkg/domain';
import { type ErrorBoundaryProps, Redirect, Stack } from 'expo-router';

import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { getSessionRoleSlots, useAuthSession } from '@/lib/auth-session';
import { BUSINESS_HOME } from '@/lib/business-home';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AppErrorBoundary error={error} retry={retry} />;
}

export default function ContractingLayout() {
  const session = useAuthSession();

  if (!hasBusinessAccess(getSessionRoleSlots(session), 'contracting')) {
    return <Redirect href={BUSINESS_HOME.equipment} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
