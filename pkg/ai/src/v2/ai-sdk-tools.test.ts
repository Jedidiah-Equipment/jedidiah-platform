import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';

import { createAiSdkTools } from './ai-sdk-tools.js';
import type { AiV2Context } from './context.js';

function createContext(role: 'admin' | 'job-viewer' | 'sales'): AiV2Context {
  return {
    access: createUserAccessSummary({ role, userId: '00000000-0000-4000-8000-000000000001' }),
  } as AiV2Context;
}

describe('createAiSdkTools v2', () => {
  test('exposes every find-then-get workflow to an administrator', () => {
    expect(Object.keys(createAiSdkTools(createContext('admin')))).toEqual([
      'findProducts',
      'getProduct',
      'findCustomers',
      'getCustomer',
      'findQuotes',
      'getQuote',
      'findJobs',
      'getJob',
    ]);
  });

  test('exposes only tools allowed by the caller permissions', () => {
    expect(Object.keys(createAiSdkTools(createContext('sales')))).toEqual(['findQuotes', 'getQuote']);
    expect(Object.keys(createAiSdkTools(createContext('job-viewer')))).toEqual(['findJobs', 'getJob']);
  });
});
