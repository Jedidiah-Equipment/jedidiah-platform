import { Redirect, Stack, useSegments } from 'expo-router';
import { useMemo } from 'react';

import { TabAccessLoadingScreen } from '@/equipment/components/TabAccessLoadingScreen';
import { counterMayOpen, storesSeat } from '@/equipment/lib/stores-access';
import { StoresActorProvider } from '@/equipment/lib/stores-actor';
import { MAIN_TAB_PARENTS } from '@/equipment/lib/toolbar-navigation';
import { useAuthSession } from '@/lib/auth-session';
import { useAccess } from '@/lib/use-access';

/**
 * Owns the Stores gate and the quick-switch state for the whole stack.
 *
 * The gate is UX: the server checks every post, and the cost projection strips prices, so nothing
 * here is load-bearing for authorization (spec §11). Hoisting the actor provider to the layout is
 * what matters — walking from the scan home into a checkout screen must not lose the person, and
 * every screen below can assume there is somewhere to read them from.
 */
export default function StoresLayout() {
  const access = useAccess();
  const { user } = useAuthSession();
  const segments = useSegments();
  const seat = useMemo(() => storesSeat({ access: access.data, user }), [access.data, user]);

  if (access.isPending) {
    return <TabAccessLoadingScreen parent={MAIN_TAB_PARENTS.stores} title="Stores" />;
  }

  if (seat === null) return <Redirect href="/" />;
  if (seat.kind === 'counter' && !counterMayOpen(segments)) return <Redirect href="/equipment/stores/stocktake" />;

  return (
    <StoresActorProvider selfActor={seat.kind === 'counter' ? seat.self : null}>
      <Stack screenOptions={{ headerShown: false }} />
    </StoresActorProvider>
  );
}
