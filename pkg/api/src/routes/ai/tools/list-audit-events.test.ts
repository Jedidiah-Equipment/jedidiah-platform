import * as core from '@pkg/core';
import { auditEvents, type Db, user } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { AuditListInput, UserAccessSummary } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { listAuditEventsTool } from '@/routes/ai/tools/list-audit-events.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester(({ db }) => ({ db }));

const firstProductId = '00000000-0000-4000-8000-000000000001';
const secondProductId = '00000000-0000-4000-8000-000000000002';

function createAiContext(db: Db, access: UserAccessSummary): AiContext {
  return {
    access,
    db,
    session: mockSession(access.role ?? 'admin'),
  };
}

describe('listAuditEventsTool', () => {
  test('returns the same audit list result shape as audit.list', async ({ context }) => {
    await createActorUser(context.db);
    await createAuditEvent(context.db, {
      actorUserId: 'test-user-id',
      entityId: firstProductId,
      occurredAt: new Date('2026-05-01T10:00:00.000Z'),
      summary: 'Oldest event',
    });
    await createAuditEvent(context.db, {
      actorUserId: 'test-user-id',
      entityId: secondProductId,
      occurredAt: new Date('2026-05-02T10:00:00.000Z'),
      summary: 'Newest event',
    });

    const input: AuditListInput = {
      filters: {
        actorUserIds: ['test-user-id'],
        entityIds: [secondProductId],
        entityTypes: ['product'],
      },
      page: 1,
      pageSize: 10,
      sortBy: 'occurredAt',
      sortDirection: 'desc',
    };
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listAuditEventsTool.handler(input, createAiContext(context.db, access)),
      context.createCaller().audit.list(input),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test('treats null tool args as the default audit list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });
    const listAuditEventsSpy = vi.spyOn(core, 'listAuditEvents').mockResolvedValue({
      items: [],
      sortBy: 'occurredAt',
      sortDirection: 'desc',
      total: 0,
    });

    try {
      await listAuditEventsTool.handler(null, createAiContext(context.db, access));

      expect(listAuditEventsSpy).toHaveBeenCalledWith({
        db: context.db,
        input: expect.objectContaining({
          page: 1,
          pageSize: 10,
          sortBy: 'occurredAt',
          sortDirection: 'desc',
        }),
      });
    } finally {
      listAuditEventsSpy.mockRestore();
    }
  });

  test('rejects invalid audit list args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(
      listAuditEventsTool.handler(
        {
          sortBy: 'bad-sort',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role: 'admin',
    updatedAt: now,
  });
}

async function createAuditEvent(
  db: Db,
  input: {
    actorUserId: string | null;
    entityId: string;
    occurredAt: Date;
    summary: string;
  },
) {
  await db.insert(auditEvents).values({
    action: 'created',
    actorUserId: input.actorUserId,
    changes: null,
    entityId: input.entityId,
    entityType: 'product',
    occurredAt: input.occurredAt,
    summary: input.summary,
  });
}
