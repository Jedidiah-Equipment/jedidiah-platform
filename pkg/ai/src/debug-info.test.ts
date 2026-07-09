import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';

import { getAiDebugInfo } from './debug-info.js';
import { createSystemPrompt } from './prompts.js';
import { AI_TOOL_REGISTRY } from './tool-registry.js';
import { getAuthorizedToolNames, getAuthorizedTools } from './tools.js';

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('getAiDebugInfo', () => {
  test('assembles the system prompt through the shared chat code path', () => {
    const info = getAiDebugInfo(adminAccess);

    // Debug info uses the same authorized tool set as chat assembly, including duplicate-tool suppression.
    expect(info.systemPrompt).toBe(createSystemPrompt(getAuthorizedToolNames(getAuthorizedTools(adminAccess))));
    expect(info.systemPrompt).toContain('## Role');
  });

  test('lists every registry tool in registry order and marks suppressed twins for a full-access user', () => {
    const info = getAiDebugInfo(adminAccess);

    expect(info.toolResultMaxSerializedBytes).toBe(24 * 1024);
    expect(info.tools.map((tool) => tool.name)).toEqual(AI_TOOL_REGISTRY.map((definition) => definition.tool.name));

    const createQuote = info.tools.find((tool) => tool.name === 'createQuote');
    expect(createQuote).toMatchObject({
      authorized: true,
      kind: 'write',
      requiredPermission: 'quote:create',
    });
    expect(createQuote?.jsonSchema).toEqual(expect.objectContaining({ type: 'object' }));
    expect(info.tools.find((tool) => tool.name === 'listQuoteCustomers')).toMatchObject({
      authorized: false,
      suppressedBy: 'listCustomers',
    });
    expect(info.tools.find((tool) => tool.name === 'listQuoteProducts')).toMatchObject({
      authorized: false,
      suppressedBy: 'listProducts',
    });
  });

  test('flags unauthorized tools and omits write-tool warnings for a null access user', () => {
    const info = getAiDebugInfo(null);

    expect(info.tools.every((tool) => !tool.authorized)).toBe(true);
    const createQuote = info.tools.find((tool) => tool.name === 'createQuote');
    expect(createQuote?.authorized).toBe(false);
    expect(info.systemPrompt).not.toContain('Write tools mutate records immediately when called');
  });

  test('gates tools per user permission for a role that lacks quote:create', () => {
    const info = getAiDebugInfo(createUserAccessSummary({ role: 'procurement-manager', userId: 'test-user-id' }));

    const authorized = new Map(info.tools.map((tool) => [tool.name, tool.authorized]));
    expect(authorized.get('createQuote')).toBe(false);
    expect(authorized.get('listProducts')).toBe(true);
    expect(info.tools.find((tool) => tool.name === 'listQuoteProducts')?.suppressedBy).toBe('listProducts');
  });

  test('produces a JSON-serializable result that survives a round-trip unchanged', () => {
    const info = getAiDebugInfo(adminAccess);

    expect(JSON.parse(JSON.stringify(info))).toEqual(info);
  });
});
