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
    expect(prompt).toContain('A Quote sources at most one Job');
    expect(prompt).toContain('Job -> Department');
    expect(prompt).toContain('A Job has no Stage rows');
    expect(prompt).toContain('through Work Slots on Bays');
    expect(prompt).toContain('Assembly -> Part');
    expect(prompt).toContain('bill-of-materials quantities must be read with the Part unit');
    expect(prompt).toContain('Part.unitOfMeasure is either quantity');
    expect(prompt).toContain('only accepted Quotes can create a Job');
    expect(prompt).toContain('A Quote sources at most one Job');
    expect(prompt).toContain('Product is required at creation and immutable post-creation');
    expect(prompt).toContain('price snapshot fields quotedBasePrice and quotedCurrencyCode are latched');
    expect(prompt).toContain('Document Notes, Preferred Delivery Date, and Planned Delivery Date');
    expect(prompt).toContain('Intent customer_job_progress');
    expect(prompt).toContain('listQuoteCustomers');
    expect(prompt).toContain('listQuotes');
    expect(prompt).toContain('getJob');
    expect(prompt).toContain('If multiple relevant Jobs have scheduled Work Slots, ask the user to choose');
    expect(prompt).toContain('Render Markdown links only from link metadata');
    expect(prompt).toContain('Do not show UUIDs in prose');
    expect(prompt).not.toContain('active or paused');
    expect(prompt).not.toContain('complete or cancelled');
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
