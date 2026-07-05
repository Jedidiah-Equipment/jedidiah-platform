import * as core from '@pkg/core';
import { type AiToolBase, AuditListInput, type AuditListResult } from '@pkg/schema';
import { toAiToolJsonSchema } from '../json-schema.js';
import { identityProjection } from '../projections.js';
import type { AiContext, AiToolDefinition } from '../tool-support.js';

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

export const listAuditEventsDefinition: AiToolDefinition<ListAuditEventsTool> = {
  kind: 'read',
  tool: listAuditEventsTool,
  descriptor: {
    purpose: 'List targeted Audit Events.',
    useWhen: [
      'The user asks what changed, who changed it, or when a known entity was modified.',
      'Entity ids, entity types, actor ids, or date bounds can narrow the history.',
    ],
    doNotUseWhen: ['The user needs current entity state rather than forensic change history.'],
    searchableIdentifiers: ['entityIds', 'entityTypes', 'actorUserIds', 'occurredAtStart', 'occurredAtEnd'],
    resultIdentifiers: ['Audit Event summary', 'entity type', 'entity id', 'actor', 'occurred time'],
  },
  projectResult: identityProjection,
};
