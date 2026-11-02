import { Redirect } from 'expo-router';
import ActivityScreen from '@/contracting/activity/ActivityScreen';
import { useCanSeeActivity } from '@/contracting/activity/use-activity';

/** Activity is for whoever reads Jobs or Breakdowns; anyone else goes home. */
export default function ContractingActivityRoute() {
  if (!useCanSeeActivity()) return <Redirect href="/" />;
  return <ActivityScreen />;
}
