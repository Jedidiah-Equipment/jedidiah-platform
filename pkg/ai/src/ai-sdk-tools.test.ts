import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';

import { createAiSdkTools } from './ai-sdk-tools.js';
import type { AiContext } from './context.js';

function createContext(role: 'admin' | 'job-viewer' | 'sales'): AiContext {
  return {
    access: createUserAccessSummary({ role, userId: '00000000-0000-4000-8000-000000000001' }),
  } as AiContext;
}

function createContextWithPermissions(permissions: NonNullable<AiContext['access']>['permissions']): AiContext {
  return { access: { permissions } } as AiContext;
}

describe('createAiSdkTools', () => {
  test('exposes every read and write workflow to an administrator', () => {
    expect(Object.keys(createAiSdkTools(createContext('admin')))).toEqual([
      'findProducts',
      'getProduct',
      'generateProductBrochureDocument',
      'findCustomers',
      'getCustomer',
      'createCustomer',
      'patchCustomer',
      'findQuotes',
      'getQuote',
      'createQuote',
      'patchQuote',
      'generateQuoteDocument',
      'sendEmail',
      'findJobs',
      'getJob',
    ]);
  });

  test('exposes only tools allowed by the caller permissions', () => {
    expect(Object.keys(createAiSdkTools(createContext('sales')))).toEqual([
      'findProducts',
      'generateProductBrochureDocument',
      'findCustomers',
      'findQuotes',
      'getQuote',
      'createQuote',
      'patchQuote',
      'generateQuoteDocument',
      'sendEmail',
    ]);
    expect(Object.keys(createAiSdkTools(createContext('job-viewer')))).toEqual(['findJobs', 'getJob']);
    expect(Object.keys(createAiSdkTools(createContextWithPermissions(['quote:create'])))).toEqual([
      'findProducts',
      'generateProductBrochureDocument',
      'findCustomers',
      'createQuote',
    ]);
  });
});
