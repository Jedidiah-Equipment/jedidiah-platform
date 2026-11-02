import { Stack } from 'expo-router';
import { CONTRACTING_TABS } from '@/contracting/lib/app-tabs';

/**
 * Every Contracting tab is a copy of this one stack, holding every Contracting screen. A record opened from another
 * record is pushed onto the tab you are in, so back (the toolbar, the iOS edge swipe, Android's back) returns to the
 * record you came from. Each tab's own list sits beneath, so a screen opened cold still has somewhere to go back to.
 */
export const unstable_settings = Object.fromEntries(CONTRACTING_TABS.map((tab) => [tab, { anchor: `${tab}/index` }]));

export default function ContractingTabStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
