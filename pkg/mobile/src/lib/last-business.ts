import { defaultBusiness, hasBusinessAccess, type RoleSlots } from '@pkg/domain';
import { BUSINESSES, type Business } from '@pkg/schema';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';

import { addBreadcrumb } from './observability';
import { createLiteralGuard } from './use-persisted-state';

// One per phone, not per user: the session's access decides whether it still applies on reopen.
const STORAGE_KEY = 'jedidiah-last-business';
const isBusiness = createLiteralGuard(BUSINESSES);

export async function rememberBusiness(business: Business): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, business);
  } catch {
    addBreadcrumb('storage', 'last business write failed');
  }
}

/** Where the app opens: the business it was last in while the session can still open it, else the default. */
export async function readLandingBusiness(access: RoleSlots | null): Promise<Business> {
  // The protected layout already signed out anyone without a business, so the last fallback is unreachable.
  const fallback = defaultBusiness(access) ?? 'equipment';
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return isBusiness(stored) && hasBusinessAccess(access, stored) ? stored : fallback;
  } catch {
    addBreadcrumb('storage', 'last business read failed');
    return fallback;
  }
}

/** Remembers `business` as the one to reopen in; null while the layout is about to redirect away. */
export function useRememberBusiness(business: Business | null): void {
  useEffect(() => {
    if (business) void rememberBusiness(business);
  }, [business]);
}
