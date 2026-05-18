import { describe, expect, test } from 'vitest';

import { createSystemPrompt } from './ai-prompts.js';

describe('AI system prompt', () => {
  test('renders role, tool use, domain, and response guidance', () => {
    const prompt = createSystemPrompt(['listQuoteCustomers', 'listQuotes', 'getJob']);

    expect(prompt).toContain('## Role');
    expect(prompt).toContain('You are the Jedidiah Platform assistant.');
    expect(prompt).toContain('## Domain Context');
    expect(prompt).toContain('Customer -> Quote');
    expect(prompt).toContain('Intent customer_job_progress');
    expect(prompt).toContain('## Tool Use');
    expect(prompt).toContain('Use tools for current platform data; do not guess records, statuses, prices, or links.');
    expect(prompt).toContain('present the five Job Stages as Departments');
    expect(prompt).toContain('## Response Style');
    expect(prompt).toContain('use pure Markdown syntax and do not use HTML tags');
    expect(prompt).toContain('Use Markdown links only when the link comes from tool result link metadata');
    expect(prompt).toContain('use those Markdown links for the matching business identifiers');
  });
});
