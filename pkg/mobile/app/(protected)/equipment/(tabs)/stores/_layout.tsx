import { Redirect, Stack } from 'expo-router';

import { TabAccessLoadingScreen } from '@/equipment/components/TabAccessLoadingScreen';
import { StoresActorProvider } from '@/equipment/lib/stores-actor';
import { MAIN_TAB_PARENTS } from '@/equipment/lib/toolbar-navigation';
import { useCan } from '@/lib/use-access';

/**
 * Owns the Stores gate and the quick-switch state for the whole stack.
 *
 * The gate is UX: the server checks every post, and the cost projection strips prices, so nothing
 * here is load-bearing for authorization (spec §11). Hoisting the actor provider to the layout is
 * what matters — walking from the scan home into a checkout screen must not lose the person, and
 * every screen below can assume there is somewhere to read them from.
 */
export default function StoresLayout() {
  const access = useCan('equipment_inventory:move');

  if (access.isPending) {
    return <TabAccessLoadingScreen parent={MAIN_TAB_PARENTS.stores} title="Stores" />;
  }

  if (!access.can) return <Redirect href="/" />;

  return (
    <StoresActorProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </StoresActorProvider>
  );
}
