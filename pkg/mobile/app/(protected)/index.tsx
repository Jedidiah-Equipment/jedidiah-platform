import type { Business } from '@pkg/schema';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { getSessionRoleSlots, useAuthSession } from '@/lib/auth-session';
import { BUSINESS_HOME } from '@/lib/business-home';
import { readLandingBusiness } from '@/lib/last-business';

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

  return business ? <Redirect href={BUSINESS_HOME[business]} /> : null;
}
