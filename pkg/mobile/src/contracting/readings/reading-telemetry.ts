import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import { apiBaseUrl } from '@/lib/api-base-url';
import { sessionCookieHeader } from '@/lib/auth';
import { withSessionCookie } from '@/lib/authed-fetch';
import { addBreadcrumb } from '@/lib/observability';
import { ReadingSyncError } from './reading-queue';
import type { ReadingSyncFailure } from './reading-sync';

type MobilePlatform = 'android' | 'ios' | 'web';

export function readingSyncTelemetryPayload(failure: ReadingSyncFailure, now = Date.now()) {
  const platform = mobilePlatform();
  if (!platform) return null;

  return {
    event: 'reading sync failed' as const,
    properties: {
      appVersion: Constants.expoConfig?.version ?? null,
      code: failure.error instanceof ReadingSyncError ? failure.error.code : errorName(failure.error),
      hasPhoto: failure.item.photoLocalUri !== null,
      platform,
      queueAgeSeconds: Math.max(0, Math.floor((now - Date.parse(failure.item.capturedAt)) / 1000)),
      role: failure.item.role,
      stage: failure.stage,
      updateId: Updates.updateId ?? null,
    },
  };
}

export async function reportReadingSyncFailure(failure: ReadingSyncFailure): Promise<void> {
  const payload = readingSyncTelemetryPayload(failure);
  if (!payload) return;

  try {
    const cookie = await sessionCookieHeader();
    await fetch(
      `${apiBaseUrl}/api/mobile/telemetry`,
      withSessionCookie(
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        cookie,
      ),
    );
  } catch {
    // Observability must never interfere with the offline queue or replace its operator-facing error.
    addBreadcrumb('contracting', 'telemetry bridge failed');
  }
}

function mobilePlatform(): MobilePlatform | null {
  return Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web' ? Platform.OS : null;
}

function errorName(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  return error.name.slice(0, 80);
}
