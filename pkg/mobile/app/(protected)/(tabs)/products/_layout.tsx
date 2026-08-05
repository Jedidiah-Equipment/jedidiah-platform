import { Redirect, Stack } from 'expo-router';

import { TabAccessLoadingScreen } from '@/components/TabAccessLoadingScreen';
import { MAIN_TAB_PARENTS } from '@/lib/toolbar-navigation';
import { useCan } from '@/lib/use-access';

/**
 * Owns the Products permission gate for the whole stack, mirroring the session gate
 * in the protected layout: hold while access resolves, redirect users without
 * Product read access, and let every screen below assume it.
 */
export default function ProductsLayout() {
  const access = useCan('product:read');

  if (access.isPending) {
    return <TabAccessLoadingScreen parent={MAIN_TAB_PARENTS.products} title="Products" />;
  }

  if (!access.can) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
