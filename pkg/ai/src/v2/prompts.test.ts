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

  test('separates email drafting, document generation, and explicit delivery', () => {
    const prompt = createSystemPrompt();

    expect(prompt).toContain('Do not call `sendEmail` when the user only asks to draft');
    expect(prompt).toContain('write the complete subject and body yourself');
    expect(prompt).toContain('copy its `attachment` result unchanged');
    expect(prompt).toContain('`{ type: "me" }`');
    expect(prompt).toContain('`links.download`');
  });
});
