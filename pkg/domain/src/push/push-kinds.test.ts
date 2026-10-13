import { APP_ROLES, type AppRole } from '@pkg/schema';
import { describe, expect, test } from 'vitest';
import { accessForRole } from '../testing/index.js';
import { isPushRecipient, pushChannelsFor, pushKindsFor } from './push-kinds.js';

describe('Push Kind registry', () => {
  // Mirrors the table in pkg/docs/content/contracting/who-gets-workshop-alerts.md.
  test('lists the kinds each role can receive, in registry order', () => {
    const kindsByRole = Object.fromEntries(
      APP_ROLES.map((role) => [role, pushKindsFor(accessForRole(role, 'u'))] as const),
    ) as Record<AppRole, string[]>;

    expect(kindsByRole).toMatchObject({
      'workshop-manager': [
        'contracting.breakdown.code-red',
        'contracting.breakdown.code-green',
        'contracting.service-due-soon',
      ],
      'contracting-manager': ['contracting.breakdown.code-red'],
      'contracting-admin': ['contracting.breakdown.code-red'],
      'super-admin': ['contracting.breakdown.code-red'],
      foreman: [],
      'contracting-invoicing': [],
    });
    expect(
      Object.entries(kindsByRole)
        .filter(([, kinds]) => kinds.length > 0)
        .map(([role]) => role)
        .sort(),
    ).toEqual(['contracting-admin', 'contracting-manager', 'super-admin', 'workshop-manager']);
  });

  test('only someone a kind can reach is a push recipient', () => {
    expect(isPushRecipient(accessForRole('workshop-manager', 'u'))).toBe(true);
    expect(isPushRecipient(accessForRole('foreman', 'u'))).toBe(false);
    expect(isPushRecipient(null)).toBe(false);
  });

  test('names each Android channel a person rings on once', () => {
    expect(pushChannelsFor(accessForRole('workshop-manager', 'u'))).toEqual([{ id: 'workshop', name: 'Workshop' }]);
    expect(pushChannelsFor(accessForRole('foreman', 'u'))).toEqual([]);
  });
});
