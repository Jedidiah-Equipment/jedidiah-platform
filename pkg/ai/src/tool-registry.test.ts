import { describe, expect, test } from 'vitest';

import { aiLinkMetadata } from './link-metadata.js';
import {
  AI_TOOL_NAMES,
  AI_TOOL_REGISTRY,
  AI_WRITE_TOOL_NAMES,
  aiToolDescriptors,
  aiTools,
  createToolDescription,
  projectAiToolResult,
} from './tool-registry.js';

const EXPECTED_TOOL_NAMES = [
  'listProducts',
  'getProduct',
  'listProductDocuments',
  'listParts',
  'getPart',
  'listCustomers',
  'getCustomer',
  'createCustomer',
  'updateCustomer',
  'listJobs',
  'getJob',
  'listBaySchedule',
  'listJobFeedback',
  'createJobFromQuote',
  'listQuotes',
  'getQuote',
  'createQuote',
  'updateQuote',
  'sendDraftQuoteEmail',
  'listStaleSentQuotes',
  'listUpcomingDeliveryQuotes',
  'summarizeQuotesByStatus',
  'summarizeQuotePipeline',
  'summarizeQuoteWeeklyFlow',
  'getQuoteProductBayAvailability',
  'listQuoteDocuments',
  'listQuoteCustomers',
  'listQuoteProducts',
  'listQuoteSalespeople',
  'listSuppliers',
  'getSupplier',
  'listFeedback',
  'submitFeedback',
  'listAuditEvents',
  'listUsers',
] as const;

describe('AI tool registry', () => {
  test('keeps the stable ordered tool list', () => {
    expect(AI_TOOL_NAMES).toEqual(EXPECTED_TOOL_NAMES);
    expect(AI_TOOL_REGISTRY).toHaveLength(35);
    expect(new Set(AI_TOOL_NAMES).size).toBe(AI_TOOL_NAMES.length);
  });

  test('derives public tool surfaces from definitions', () => {
    for (const record of AI_TOOL_REGISTRY) {
      const name = record.tool.name;

      expect(aiTools[name]).toMatchObject({
        description: createToolDescription(aiToolDescriptors[name]),
        kind: record.kind,
        name,
        requiredPermission: record.tool.requiredPermission,
      });
      expect(projectAiToolResult(name, { ok: true })).toBeDefined();
    }
  });

  test('keeps write-tool partition derived from definition kind', () => {
    const writeToolNames = AI_TOOL_REGISTRY.filter((record) => record.kind === 'write').map(
      (record) => record.tool.name,
    );

    expect([...AI_WRITE_TOOL_NAMES]).toEqual(writeToolNames);
    expect(writeToolNames).toEqual([
      'createCustomer',
      'updateCustomer',
      'createJobFromQuote',
      'createQuote',
      'updateQuote',
      'sendDraftQuoteEmail',
      'submitFeedback',
    ]);
  });

  test('references known link metadata entries from descriptors', () => {
    const knownTargets = new Set(
      Object.values(aiLinkMetadata).map((target) => `${target.entity}:${target.label}:${target.href}`),
    );

    for (const descriptor of Object.values(aiToolDescriptors)) {
      if (descriptor.linkTarget) {
        expect(
          knownTargets.has(
            `${descriptor.linkTarget.entity}:${descriptor.linkTarget.label}:${descriptor.linkTarget.href}`,
          ),
        ).toBe(true);
      }
    }
  });
});
