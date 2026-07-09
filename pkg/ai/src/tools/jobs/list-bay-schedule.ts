import * as core from '@pkg/core';
import { type AiToolBase, BoardListInput, type BoardListResult } from '@pkg/schema';
import type { AiContext } from '@/context.js';
import { aiLinkMetadata } from '@/link-metadata.js';
import type { AiToolDefinition } from '@/tool-definition.js';
import { toAiToolJsonSchema } from '../json-schema.js';
import { projectBaySchedule } from '../projections.js';

export type ListBayScheduleTool = AiToolBase<'listBaySchedule', BoardListResult, BoardListInput, AiContext>;

export const listBayScheduleTool: ListBayScheduleTool = {
  name: 'listBaySchedule',
  inputSchema: BoardListInput,
  jsonSchema: {
    ...toAiToolJsonSchema(BoardListInput),
    required: [],
  },
  requiredPermission: 'job:read',
  async handler(args: unknown, ctx: AiContext) {
    const input = BoardListInput.parse(args ?? {});
    return core.listBays({ db: ctx.db, input });
  },
};

export const listBayScheduleDefinition: AiToolDefinition<ListBayScheduleTool> = {
  kind: 'read',
  tool: listBayScheduleTool,
  descriptor: {
    purpose: 'List the production schedule: Work Slots on Bays grouped by Department, with Job display facts.',
    useWhen: [
      'The user asks what a Department or Bay is working on, or which Bays are free over a date window (e.g. "what is scheduled in Paint", "which bays are free next week").',
    ],
    doNotUseWhen: ["Reporting a single Job's progress; getJob already returns that Job's Work Slots."],
    resultIdentifiers: [
      'Bay name',
      'Department',
      'Bay disabled flag',
      'Work Slot date range and kind (work or idle)',
      'Job Code',
      'Customer company name',
      'Product name / Custom Work Title',
    ],
    linkTarget: aiLinkMetadata.Job,
  },
  projectResult: projectBaySchedule,
};
