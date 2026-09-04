import { Redirect } from 'expo-router';
import { getSessionBusinessAccess, useAuthSession } from '@/lib/auth-session';

export default function ProtectedIndex() {
  const session = useAuthSession();
  const access = getSessionBusinessAccess(session);

  return <Redirect href={access.equipment ? '/equipment' : '/contracting'} />;
}
