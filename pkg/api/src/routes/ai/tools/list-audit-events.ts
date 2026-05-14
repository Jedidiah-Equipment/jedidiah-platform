import * as core from '@pkg/core';
import { type AiToolBase, AuditListInput, type AuditListResult } from '@pkg/schema';
import { z } from 'zod';

import type { AiContext } from '../ai-context.js';

export type ListAuditEventsTool = AiToolBase<'listAuditEvents', AuditListResult, AuditListInput, AiContext>;

export const listAuditEventsTool: ListAuditEventsTool = {
  name: 'listAuditEvents',
  description: 'List audit events with the same filters, sort, and paging available in the audit page.',
  inputSchema: AuditListInput,
  jsonSchema: z.toJSONSchema(AuditListInput) as Record<string, unknown>,
  requiredPermission: 'audit:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = AuditListInput.parse(args ?? {});
    return core.listAuditEvents(ctx.db, input);
  },
};
