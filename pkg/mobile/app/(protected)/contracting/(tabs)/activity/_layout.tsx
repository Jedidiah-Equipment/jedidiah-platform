import { Redirect, Stack } from 'expo-router';
import { useCanSeeActivity } from '@/contracting/activity/use-activity';

/** Activity is for whoever reads Jobs or Breakdowns; anyone else goes home. */
export default function ContractingActivityLayout() {
  if (!useCanSeeActivity()) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
