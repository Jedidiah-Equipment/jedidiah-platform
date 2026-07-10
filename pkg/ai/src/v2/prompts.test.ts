import { describe, expect, test } from 'vitest';

import { createSystemPrompt } from './prompts.js';

describe('v2 system prompt', () => {
  test('renders entity names using code-owned app links', () => {
    const prompt = createSystemPrompt();

    expect(prompt).toContain('first mention of that entity as a Markdown link');
    expect(prompt).toContain('[Compact Loader](/products/123/edit)');
    expect(prompt).toContain('Do not show the raw app URL');
    expect(prompt).toContain('Never invent or modify a URL');
    expect(prompt).toContain('If `links.app` is absent, use plain text');
  });
});
