import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';

import { getAiDebugInfo } from './debug-info.js';
import { createSystemPrompt } from './prompts.js';
import { AI_TOOL_REGISTRY } from './tool-registry.js';

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('getAiDebugInfo', () => {
  test('assembles the system prompt through the shared chat code path', () => {
    const info = getAiDebugInfo(adminAccess);

    // A full-access admin authorizes every registry tool, so the prompt must equal the shared
    // createSystemPrompt output for the full ordered tool list — proving no parallel assembly.
    expect(info.systemPrompt).toBe(createSystemPrompt(AI_TOOL_REGISTRY.map((definition) => definition.tool.name)));
    expect(info.systemPrompt).toContain('## Role');
  });

  test('lists every registry tool in registry order, authorized for a full-access user', () => {
    const info = getAiDebugInfo(adminAccess);

    expect(info.tools.map((tool) => tool.name)).toEqual(AI_TOOL_REGISTRY.map((definition) => definition.tool.name));
    expect(info.tools.every((tool) => tool.authorized)).toBe(true);

    const createQuote = info.tools.find((tool) => tool.name === 'createQuote');
    expect(createQuote).toMatchObject({
      authorized: true,
      kind: 'write',
      requiredPermission: 'quote:create',
    });
    expect(createQuote?.jsonSchema).toEqual(expect.objectContaining({ type: 'object' }));
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
  });

  test('produces a JSON-serializable result that survives a round-trip unchanged', () => {
    const info = getAiDebugInfo(adminAccess);

    expect(JSON.parse(JSON.stringify(info))).toEqual(info);
  });
});
