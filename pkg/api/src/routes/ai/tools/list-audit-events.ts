import * as core from '@pkg/core';
import { type AiToolBase, AuditListInput, type AuditListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListAuditEventsTool = AiToolBase<'listAuditEvents', AuditListResult, AuditListInput, AiContext>;

export const listAuditEventsTool: ListAuditEventsTool = {
  name: 'listAuditEvents',
  description:
    'List targeted audit events. Prefer specific queries over broad history scans: pass filters.entityIds when the related entity id is known, such as a product id for product audit history; combine it with filters.entityTypes, actorUserIds, and occurredAtStart/occurredAtEnd to narrow the result window. Use sortDirection, page, and pageSize to return the right slice in newest-first or oldest-first order.',
  inputSchema: AuditListInput,
  jsonSchema: z.toJSONSchema(AuditListInput) as Record<string, unknown>,
  requiredPermission: 'audit:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = AuditListInput.parse(args ?? {});
    return core.listAuditEvents({ db: ctx.db, input });
  },
};
