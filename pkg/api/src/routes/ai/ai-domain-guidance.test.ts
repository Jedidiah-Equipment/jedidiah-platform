import { describe, expect, test } from 'vitest';

import {
  AI_RETRIEVAL_PLAYBOOKS,
  assertPlaybooksReferenceRegisteredTools,
  createDomainGuidancePrompt,
} from './ai-domain-guidance.js';
import type { AiToolName } from './ai-tools.js';

describe('AI domain guidance', () => {
  test('playbooks reference registered tools', () => {
    expect(() => assertPlaybooksReferenceRegisteredTools()).not.toThrow();
  });

  test('renders Customer to Quote to Job guidance when required tools are available', () => {
    const prompt = createDomainGuidancePrompt(['listQuoteCustomers', 'listQuotes', 'getJob']);

    expect(prompt).toContain('Customer -> Quote');
    expect(prompt).toContain('Quote -> Job');
    expect(prompt).toContain('A Quote may source any number of Jobs');
    expect(prompt).toContain('Job -> Department');
    expect(prompt).toContain('users experience and label them as Departments');
    expect(prompt).toContain('Quote Status is a cosmetic label with no transition rules');
    expect(prompt).toContain('Product is required at creation and immutable post-creation');
    expect(prompt).toContain('price snapshot fields quotedBasePrice and quotedCurrencyCode are latched');
    expect(prompt).toContain('Payment Terms, Preferred Delivery Date, and Planned Delivery Date');
    expect(prompt).toContain('Intent customer_job_progress');
    expect(prompt).toContain('listQuoteCustomers');
    expect(prompt).toContain('listQuotes');
    expect(prompt).toContain('getJob');
    expect(prompt).toContain('If multiple active or paused Jobs exist, ask the user to choose');
    expect(prompt).toContain('Render Markdown links only from link metadata');
    expect(prompt).toContain('Do not show UUIDs in prose');
    expect(prompt).not.toContain('Quote lifecycle');
    expect(prompt).not.toContain('prefer accepted Quotes');
  });

  test('renders Customer to Quote to Job guidance when an alternative customer lookup is available', () => {
    const prompt = createDomainGuidancePrompt(['listCustomers', 'listQuotes', 'getJob']);

    expect(prompt).toContain('Intent customer_job_progress');
    expect(prompt).toContain('listCustomers: Find matching Customers by company name');
    expect(prompt).not.toContain('listQuoteCustomers: Find matching Customers by company name');
  });

  test('does not render an unusable playbook when required tools are unavailable', () => {
    const prompt = createDomainGuidancePrompt(['listQuotes'] satisfies AiToolName[]);

    expect(prompt).toContain('Customer -> Quote');
    expect(prompt).not.toContain('Intent customer_job_progress');
  });

  test('the Customer Job progress playbook keeps the expected traversal order', () => {
    const playbook = AI_RETRIEVAL_PLAYBOOKS.find((item) => item.intent === 'customer_job_progress');

    expect(playbook?.steps.map((step) => step.tool)).toEqual(['listQuoteCustomers', 'listQuotes', 'getJob']);
    expect(playbook?.steps[0]?.alternatives).toEqual(['listCustomers']);
  });
});
