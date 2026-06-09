import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AuditEvent, AuditListInput } from './audit.js';

describe('AuditEvent', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(AuditEvent)).not.toThrow();
  });

  it('accepts Job Bay audit events', () => {
    expect(
      AuditEvent.parse({
        action: 'updated',
        actorEmail: 'admin@example.com',
        actorName: 'Admin',
        actorUserId: 'admin-user',
        changes: null,
        entityId: '00000000-0000-4000-8000-000000000001',
        entityType: 'job_bay',
        id: '00000000-0000-4000-8000-000000000002',
        occurredAt: '2026-06-01T00:00:00.000Z',
        summary: 'Updated Bay "Fabrication Bay 1"',
      }),
    ).toMatchObject({ entityType: 'job_bay' });
  });
});

describe('AuditListInput', () => {
  it('can be represented as JSON Schema', () => {
    expect(() => z.toJSONSchema(AuditListInput)).not.toThrow();
  });
});
