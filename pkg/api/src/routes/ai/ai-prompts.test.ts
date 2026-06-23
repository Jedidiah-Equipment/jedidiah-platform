import { describe, expect, test } from 'vitest';

import { createSystemPrompt } from './ai-prompts.js';

describe('AI system prompt', () => {
  test('renders role, tool use, domain, and response guidance', () => {
    const prompt = createSystemPrompt(['listQuoteCustomers', 'listQuotes', 'getJob']);

    expect(prompt).toContain('## Role');
    expect(prompt).toContain('You are the JedidiahOps assistant.');
    expect(prompt).toContain('## Domain Context');
    expect(prompt).toContain('Customer -> Quote');
    expect(prompt).toContain('Intent customer_job_progress');
    expect(prompt).toContain('## Tool Use');
    expect(prompt).toContain('Use tools for current app data; do not guess records, statuses, prices, or links.');
    expect(prompt).toContain('describe scheduled Work Slots on Bays grouped by Department');
    expect(prompt).toContain('Quote Status as the Job creation gate');
    expect(prompt).toContain('Product as immutable after creation');
    expect(prompt).toContain('quotedBasePrice plus quotedCurrencyCode as the price snapshot latched at creation');
    expect(prompt).toContain('## Response Style');
    expect(prompt).toContain('use pure Markdown syntax and do not use HTML tags');
    expect(prompt).toContain('Use Markdown links only when the link comes from tool result link metadata');
    expect(prompt).toContain('When a tool result record includes a links array');
    expect(prompt).toContain('prefer Rand formatting like "R 20 990.20"');
    expect(prompt).toContain('write mm quantities like "6000 mm"');
  });
});
