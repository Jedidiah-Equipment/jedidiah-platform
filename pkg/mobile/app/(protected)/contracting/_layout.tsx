import { Redirect, Stack } from 'expo-router';

import { getSessionBusinessAccess, useAuthSession } from '@/lib/auth-session';

export default function ContractingLayout() {
  const session = useAuthSession();

  if (!getSessionBusinessAccess(session).contracting) {
    return <Redirect href="/equipment" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
