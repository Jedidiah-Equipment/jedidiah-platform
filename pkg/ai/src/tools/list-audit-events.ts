import * as core from '@pkg/core';
import { type AiToolBase, AuditListInput, type AuditListResult } from '@pkg/schema';

import type { AiContext } from '../context.js';
import { toAiToolJsonSchema } from './json-schema.js';

export type ListAuditEventsTool = AiToolBase<'listAuditEvents', AuditListResult, AuditListInput, AiContext>;

export const listAuditEventsTool: ListAuditEventsTool = {
  name: 'listAuditEvents',
  inputSchema: AuditListInput,
  jsonSchema: toAiToolJsonSchema(AuditListInput),
  requiredPermission: 'audit:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = AuditListInput.parse(args ?? {});
    return core.listAuditEvents({ db: ctx.db, input });
  },
};
