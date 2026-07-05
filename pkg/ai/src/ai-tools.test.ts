import { createUserAccessSummary } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import pino from 'pino';
import { describe, expect, test } from 'vitest';
import { aiToolDescriptors, createToolDescription } from './ai-tool-descriptors.js';
import { AI_TOOL_REGISTRY } from './ai-tool-registry.js';
import {
  AI_TOOL_NAMES,
  aiTools,
  createAgentTools,
  dispatchToolCall,
  getAuthorizedToolNames,
  getAuthorizedTools,
  toStrictJsonObjectParameters,
} from './ai-tools.js';
import type { AiContext } from './context.js';
import { mockSession } from './test/test-utils.js';

function createAiContext(access: UserAccessSummary | null = null): AiContext {
  return {
    access,
    db: {} as AiContext['db'],
    deliverQuoteDraftEmail: async () => ({ recipientEmail: 'test@example.com', warnings: [] }),
    log: pino({ level: 'silent' }),
    session: mockSession(access?.role ?? 'sales'),
    storage: {} as AiContext['storage'],
  };
}

function createAccessWithNoProductRead(): UserAccessSummary {
  return {
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
        kind: record.kind,
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
    expect(jobDescriptions).toContain('Product serial number (null for Custom Jobs)');
    expect(jobDescriptions).toContain('Work Title display fallback for Custom Jobs');
    expect(jobDescriptions).toContain('Custom Jobs start without Product Document Snapshots or generated Brochures');
    expect(jobDescriptions).not.toContain('Stage');
    expect(jobDescriptions).not.toContain('Job Status');
    expect(jobDescriptions).not.toContain('Due Date');
    expect(jobDescriptions).not.toContain('Workflow events');
  });

  test('keeps Quote tool descriptions aligned to Product and Custom Quote pricing', () => {
    const quoteDescriptions = [
      aiTools.listQuotes.description,
      aiTools.getQuote.description,
      aiTools.createQuote.description,
    ].join('\n');

    expect(quoteDescriptions).toContain(
      'Product UUID and nested product facts (name, modelCode, buildTimeDays, currencyCode) when this is a Product Quote; product is null for Custom Quotes or unresolved Product projections',
    );
    expect(quoteDescriptions).toContain('Work Title display fallback when this is a Custom Quote');
    expect(quoteDescriptions).toContain(
      'quotedBasePrice and quotedCurrencyCode: latched from Product for Product Quotes; entered base price in ZAR for Custom Quotes',
    );
    expect(quoteDescriptions).toContain(
      'quotedBasePrice: latched from Product for Product Quotes; entered base price for Custom Quotes',
    );
    expect(quoteDescriptions).toContain('Quote Line Items quantity x unit price contribution');
    expect(quoteDescriptions).toContain('Selected Assemblies for Product Quotes; empty for Custom Quotes');
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

  test('keeps registered parameters within the OpenAI tool schema subset', () => {
    for (const name of AI_TOOL_NAMES) {
      expect(collectJsonSchemaPaths(aiTools[name].jsonSchema, name, 'oneOf')).toEqual([]);
      expect(collectUnsupportedRegexPatternPaths(aiTools[name].jsonSchema, name)).toEqual([]);
    }
  });

  test('declares a required permission for each tool', () => {
    expect(aiTools.getCustomer.requiredPermission).toBe('customer:read');
    expect(aiTools.getJob.requiredPermission).toBe('job:read');
    expect(aiTools.getPart.requiredPermission).toBe('part:read');
    expect(aiTools.getProduct.requiredPermission).toBe('product:read');
    expect(aiTools.getQuote.requiredPermission).toBe('quote:read');
    expect(aiTools.createCustomer.requiredPermission).toBe('customer:create');
    expect(aiTools.createQuote.requiredPermission).toBe('quote:create');
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
    expect(aiTools.sendDraftQuoteEmail.requiredPermission).toBe('quote:update');
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
      'createCustomer',
      'listJobs',
      'getJob',
    ]);
  });

  test('returns part tools for part readers', () => {
    const tools = getAuthorizedTools({
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
      'createQuote',
      'sendDraftQuoteEmail',
      'listQuoteCustomers',
      'listQuoteProducts',
      'listQuoteSalespeople',
    ]);
  });

  test('returns job tools for job readers', () => {
    const tools = getAuthorizedTools({
      permissions: ['job:read'],
      role: 'sales',
      userId: 'test-user-id',
    });

    expect(getAuthorizedToolNames(tools)).toEqual(['listJobs', 'getJob']);
  });

  test('returns customer tools for customer readers', () => {
    const tools = getAuthorizedTools({
      permissions: ['customer:read'],
      role: 'sales',
      userId: 'test-user-id',
    });

    expect(getAuthorizedToolNames(tools)).toEqual(['listCustomers', 'getCustomer']);
  });

  test('returns audit and user tools for their permissions', () => {
    const tools = getAuthorizedTools({
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
      'createCustomer',
      'listJobs',
      'getJob',
      'listQuotes',
      'getQuote',
      'createQuote',
      'sendDraftQuoteEmail',
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

  test('can filter authorized tools down to read-only tools', () => {
    const tools = getAuthorizedTools(
      createUserAccessSummary({
        role: 'sales',
        userId: 'test-user-id',
      }),
      { includeWriteTools: false },
    );

    expect(getAuthorizedToolNames(tools)).toEqual([
      'listQuotes',
      'getQuote',
      'listQuoteCustomers',
      'listQuoteProducts',
      'listQuoteSalespeople',
    ]);
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

function collectJsonSchemaPaths(schema: unknown, path: string, key: string): string[] {
  if (Array.isArray(schema)) {
    return schema.flatMap((item, index) => collectJsonSchemaPaths(item, `${path}[${index}]`, key));
  }

  if (!schema || typeof schema !== 'object') {
    return [];
  }

  return [
    ...(key in schema ? [path] : []),
    ...Object.entries(schema).flatMap(([childKey, value]) => collectJsonSchemaPaths(value, `${path}.${childKey}`, key)),
  ];
}

function collectUnsupportedRegexPatternPaths(schema: unknown, path: string): string[] {
  if (Array.isArray(schema)) {
    return schema.flatMap((item, index) => collectUnsupportedRegexPatternPaths(item, `${path}[${index}]`));
  }

  if (!schema || typeof schema !== 'object') {
    return [];
  }

  const pattern = 'pattern' in schema ? schema.pattern : undefined;

  return [
    ...(typeof pattern === 'string' && hasRegexLookaround(pattern) ? [`${path}.pattern`] : []),
    ...Object.entries(schema).flatMap(([childKey, value]) =>
      collectUnsupportedRegexPatternPaths(value, `${path}.${childKey}`),
    ),
  ];
}

function hasRegexLookaround(pattern: string) {
  return /\(\?(?:[=!]|<[=!])/.test(pattern);
}
