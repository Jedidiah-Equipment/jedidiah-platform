import { hasBusinessAccess } from '@pkg/domain';
import { Redirect, Stack } from 'expo-router';

import { ReadingQueueProvider } from '@/contracting/readings/ReadingQueueProvider';

import { getSessionRoleSlots, useAuthSession } from '@/lib/auth-session';
import { BUSINESS_HOME } from '@/lib/business-home';

export default function ContractingLayout() {
  const session = useAuthSession();

  if (!hasBusinessAccess(getSessionRoleSlots(session), 'contracting')) {
    return <Redirect href={BUSINESS_HOME.equipment} />;
  }

  return (
    <ReadingQueueProvider key={session.user.id}>
      <Stack screenOptions={{ headerShown: false }} />
    </ReadingQueueProvider>
  );
}
