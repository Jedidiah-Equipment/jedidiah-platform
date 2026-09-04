import { defaultBusiness } from '@pkg/domain';
import { Redirect } from 'expo-router';
import { getSessionRoleSlots, useAuthSession } from '@/lib/auth-session';
import { BUSINESS_HOME } from '@/lib/business-home';

export default function ProtectedIndex() {
  const session = useAuthSession();
  // The protected layout already signed out anyone without a business, so the fallback is unreachable.
  const business = defaultBusiness(getSessionRoleSlots(session)) ?? 'equipment';

  return <Redirect href={BUSINESS_HOME[business]} />;
}
