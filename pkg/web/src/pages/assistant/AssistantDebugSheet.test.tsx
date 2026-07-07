import type { AiDebugInfo, AiToolDebugInfo } from '@pkg/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AssistantDebugContent } from './AssistantDebugSheet.js';
import { isDebugSheetHotkey } from './useDebugSheetHotkey.js';

describe('isDebugSheetHotkey', () => {
  it('matches Cmd+. and Ctrl+.', () => {
    expect(isDebugSheetHotkey({ key: '.', metaKey: true, ctrlKey: false })).toBe(true);
    expect(isDebugSheetHotkey({ key: '.', metaKey: false, ctrlKey: true })).toBe(true);
  });

  it('ignores a bare period and modified non-period keys', () => {
    expect(isDebugSheetHotkey({ key: '.', metaKey: false, ctrlKey: false })).toBe(false);
    expect(isDebugSheetHotkey({ key: 'k', metaKey: true, ctrlKey: false })).toBe(false);
  });
});

describe('AssistantDebugContent', () => {
  it('renders the system prompt and every tool row', () => {
    const html = renderToStaticMarkup(<AssistantDebugContent info={buildDebugInfo()} />);

    expect(html).toContain('You are the JedidiahOps assistant.');
    expect(html).toContain('listProducts');
    expect(html).toContain('createQuote');
    expect(html).toContain('product:read');
    expect(html).toContain('quote:create');
    expect(html).toContain('Tools (2)');
  });

  it('renders the estimated input token breakdown', () => {
    const html = renderToStaticMarkup(<AssistantDebugContent info={buildDebugInfo()} />);

    expect(html).toContain('Estimated input tokens');
    expect(html).toContain('1 234');
    expect(html).toContain('800');
    expect(html).toContain('434');
    expect(html).toContain('Tool result budget');
    expect(html).toContain('24 576 bytes');
  });

  it('flags an unauthorized tool without hiding it', () => {
    const html = renderToStaticMarkup(<AssistantDebugContent info={buildDebugInfo()} />);

    expect(html).toContain('createQuote');
    expect(html).toContain('No access');
    // The authorized tool must not carry the flag.
    expect(html.match(/No access/g)).toHaveLength(1);
  });
});

function buildDebugInfo(): AiDebugInfo {
  return {
    estimatedInputTokens: { systemPrompt: 800, tools: 434, total: 1234 },
    systemPrompt: '## Role\n- You are the JedidiahOps assistant.',
    toolResultMaxSerializedBytes: 24 * 1024,
    tools: [
      buildTool({
        authorized: true,
        kind: 'read',
        name: 'listProducts',
        purpose: 'List Products.',
        requiredPermission: 'product:read',
      }),
      buildTool({
        authorized: false,
        kind: 'write',
        name: 'createQuote',
        purpose: 'Create a Quote.',
        requiredPermission: 'quote:create',
      }),
    ],
  };
}

function buildTool(overrides: Partial<AiToolDebugInfo> & Pick<AiToolDebugInfo, 'name'>): AiToolDebugInfo {
  return {
    authorized: true,
    doNotUseWhen: [],
    jsonSchema: { additionalProperties: false, properties: {}, type: 'object' },
    kind: 'read',
    linkTarget: null,
    purpose: 'Purpose.',
    requiredPermission: 'product:read',
    resultIdentifiers: [],
    searchableIdentifiers: [],
    useWhen: [],
    ...overrides,
  };
}
