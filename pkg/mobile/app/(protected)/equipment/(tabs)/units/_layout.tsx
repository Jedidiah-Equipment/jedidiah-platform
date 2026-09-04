import { Redirect, Stack } from 'expo-router';

import { TabAccessLoadingScreen } from '@/equipment/components/TabAccessLoadingScreen';
import { MAIN_TAB_PARENTS } from '@/equipment/lib/toolbar-navigation';
import { useCan } from '@/lib/use-access';

/**
 * Owns the Units permission gate for the whole stack, mirroring the session gate
 * in the protected layout: hold while access resolves, redirect users without
 * Product Unit read access, and let every screen below assume it.
 */
export default function UnitsLayout() {
  const access = useCan('equipment_product_unit:read');

  if (access.isPending) {
    return <TabAccessLoadingScreen parent={MAIN_TAB_PARENTS.units} title="Units" />;
  }

  if (!access.can) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
