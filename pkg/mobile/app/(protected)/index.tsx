import type { Business } from '@pkg/schema';
import { type Href, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { getSessionRoleSlots, useAuthSession } from '@/lib/auth-session';
import { BUSINESS_HOME } from '@/lib/business-home';
import { readLandingBusiness } from '@/lib/last-business';
import { pendingPushPath } from '@/lib/push/push-response';

export default function ProtectedIndex() {
  const session = useAuthSession();
  const [business, setBusiness] = useState<Business | null>(null);

  useEffect(() => {
    let active = true;
    void readLandingBusiness(getSessionRoleSlots(session)).then((landing) => {
      if (active) setBusiness(landing);
    });
    return () => {
      active = false;
    };
  }, [session]);

  // A push tapped while signed out lands here after sign-in; open its record rather than the business home.
  const pending = pendingPushPath();
  if (pending) return <Redirect href={pending as Href} />;
  return business ? <Redirect href={BUSINESS_HOME[business]} /> : null;
}
