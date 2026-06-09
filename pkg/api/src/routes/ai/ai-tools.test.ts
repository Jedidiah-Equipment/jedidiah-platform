import { createUserAccessSummary } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { aiToolDescriptors, createToolDescription } from '@/routes/ai/ai-tool-descriptors.js';
import { AI_TOOL_REGISTRY } from '@/routes/ai/ai-tool-registry.js';
import {
  AI_TOOL_NAMES,
  aiTools,
  createAgentTools,
  dispatchToolCall,
  getAuthorizedToolNames,
  getAuthorizedTools,
  toStrictJsonObjectParameters,
} from '@/routes/ai/ai-tools.js';
import { mockSession } from '@/test/test-utils.js';

function createAiContext(access: UserAccessSummary | null = null): AiContext {
  return {
    access,
    db: {} as AiContext['db'],
    session: mockSession(access?.role ?? 'sales'),
  };
}

function createAccessWithNoProductRead(): UserAccessSummary {
  return {
    departments: [],
    permissions: [],
    role: 'sales',
    userId: 'test-user-id',
  };
}

describe('aiTools', () => {
  test('derives public tool surfaces from the ordered registry', () => {
    expect(AI_TOOL_NAMES).toEqual(AI_TOOL_REGISTRY.map((record) => record.tool.name));

    for (const record of AI_TOOL_REGISTRY) {
      expect(aiTools[record.tool.name]).toMatchObject({
        name: record.tool.name,
        requiredPermission: record.tool.requiredPermission,
      });
      expect(aiToolDescriptors[record.tool.name]).toMatchObject({
        name: record.tool.name,
        purpose: record.descriptor.purpose,
      });
    }
  });

  test('generates registered tool descriptions from structured descriptors', () => {
    for (const name of AI_TOOL_NAMES) {
      expect(aiTools[name].description).toBe(createToolDescription(aiToolDescriptors[name]));
      expect(aiTools[name].description).toContain(aiToolDescriptors[name].purpose);
      expect(aiTools[name].jsonSchema).toEqual(expect.objectContaining({ type: 'object' }));
    }
  });

  test('keeps Job tool descriptions aligned to the current Job contract', () => {
    const jobDescriptions = [aiTools.listJobs.description, aiTools.getJob.description].join('\n');

    expect(jobDescriptions).toContain('Bay schedule detail');
    expect(jobDescriptions).toContain('CFO Part quantities with unitOfMeasure');
    expect(jobDescriptions).not.toContain('Stage');
    expect(jobDescriptions).not.toContain('Job Status');
    expect(jobDescriptions).not.toContain('Due Date');
    expect(jobDescriptions).not.toContain('Workflow events');
  });

  test('creates strict Agents tools with closed object parameter schemas', () => {
    for (const name of AI_TOOL_NAMES) {
      expect(() => toStrictJsonObjectParameters(name, aiTools[name].jsonSchema)).not.toThrow();
    }

    const tools = createAgentTools(
      getAuthorizedTools(
        createUserAccessSummary({
          role: 'admin',
          userId: 'test-user-id',
        }),
      ),
      () => undefined,
      () => undefined,
    );

    for (const tool of tools) {
      expect(tool.type).toBe('function');

      if (tool.type === 'function') {
        expect(tool.strict).toBe(true);
      }
    }
  });

  test('declares a required permission for each tool', () => {
    expect(aiTools.getCustomer.requiredPermission).toBe('customer:read');
    expect(aiTools.getJob.requiredPermission).toBe('job:read');
    expect(aiTools.getPart.requiredPermission).toBe('part:read');
    expect(aiTools.getProduct.requiredPermission).toBe('product:read');
    expect(aiTools.getQuote.requiredPermission).toBe('quote:read');
    expect(aiTools.listAuditEvents.requiredPermission).toBe('audit:read');
    expect(aiTools.listCustomers.requiredPermission).toBe('customer:read');
    expect(aiTools.listJobs.requiredPermission).toBe('job:read');
    expect(aiTools.listParts.requiredPermission).toBe('part:read');
    expect(aiTools.listProducts.requiredPermission).toBe('product:read');
    expect(aiTools.listQuoteCustomers.requiredPermission).toBe('quote:read');
    expect(aiTools.listQuoteProducts.requiredPermission).toBe('quote:read');
    expect(aiTools.listQuoteSalespeople.requiredPermission).toBe('quote:read');
    expect(aiTools.listQuotes.requiredPermission).toBe('quote:read');
    expect(aiTools.listUsers.requiredPermission).toBe('user:list');
  });

  test('returns procurement tools for procurement managers', () => {
    const tools = getAuthorizedTools(
      createUserAccessSummary({
        role: 'procurement-manager',
        userId: 'test-user-id',
      }),
    );

    expect(getAuthorizedToolNames(tools)).toEqual([
      'listProducts',
      'getProduct',
      'listParts',
      'getPart',
      'listCustomers',
      'getCustomer',
      'listJobs',
      'getJob',
    ]);
  });

  test('returns part tools for part readers', () => {
    const tools = getAuthorizedTools({
      departments: [],
      permissions: ['part:read'],
      role: 'sales',
      userId: 'test-user-id',
    });

    expect(getAuthorizedToolNames(tools)).toEqual(['listParts', 'getPart']);
  });

  test('returns quote tools for sales users', () => {
    const tools = getAuthorizedTools(
      createUserAccessSummary({
        role: 'sales',
        userId: 'test-user-id',
      }),
    );

    expect(getAuthorizedToolNames(tools)).toEqual([
      'listQuotes',
      'getQuote',
      'listQuoteCustomers',
      'listQuoteProducts',
      'listQuoteSalespeople',
    ]);
  });

  test('returns job tools for job readers', () => {
    const tools = getAuthorizedTools({
      departments: [],
      permissions: ['job:read'],
      role: 'sales',
      userId: 'test-user-id',
    });

    expect(getAuthorizedToolNames(tools)).toEqual(['listJobs', 'getJob']);
  });

  test('returns customer tools for customer readers', () => {
    const tools = getAuthorizedTools({
      departments: [],
      permissions: ['customer:read'],
      role: 'sales',
      userId: 'test-user-id',
    });

    expect(getAuthorizedToolNames(tools)).toEqual(['listCustomers', 'getCustomer']);
  });

  test('returns audit and user tools for their permissions', () => {
    const tools = getAuthorizedTools({
      departments: [],
      permissions: ['audit:read', 'user:list'],
      role: 'sales',
      userId: 'test-user-id',
    });

    expect(getAuthorizedToolNames(tools)).toEqual(['listAuditEvents', 'listUsers']);
  });

  test('returns all tools for admins', () => {
    const tools = getAuthorizedTools(
      createUserAccessSummary({
        role: 'admin',
        userId: 'test-user-id',
      }),
    );

    expect(getAuthorizedToolNames(tools)).toEqual([
      'listProducts',
      'getProduct',
      'listParts',
      'getPart',
      'listCustomers',
      'getCustomer',
      'listJobs',
      'getJob',
      'listQuotes',
      'getQuote',
      'listQuoteCustomers',
      'listQuoteProducts',
      'listQuoteSalespeople',
      'listAuditEvents',
      'listUsers',
    ]);
  });

  test('hides tools when the user lacks the required permission', () => {
    expect(getAuthorizedTools(createAccessWithNoProductRead())).toEqual({});
    expect(getAuthorizedTools(null)).toEqual({});
  });

  test('dispatches only against the supplied tool map', async () => {
    await expect(
      dispatchToolCall({}, 'listProducts', {}, createAiContext(createAccessWithNoProductRead())),
    ).resolves.toEqual({
      error: 'Unknown tool: listProducts',
      name: 'listProducts',
      ok: false,
    });
  });
});
