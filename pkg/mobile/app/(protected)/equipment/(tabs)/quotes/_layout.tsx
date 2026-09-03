import { Redirect, Stack } from 'expo-router';

import { TabAccessLoadingScreen } from '@/equipment/components/TabAccessLoadingScreen';
import { MAIN_TAB_PARENTS } from '@/equipment/lib/toolbar-navigation';
import { useCan } from '@/lib/use-access';

/** Owns the Quotes permission gate so every screen in the stack can assume Quote read access. */
export default function QuotesLayout() {
  const access = useCan('quote:read');

  if (access.isPending) {
    return <TabAccessLoadingScreen parent={MAIN_TAB_PARENTS.quotes} title="Quotes" />;
  }

  if (!access.can) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
