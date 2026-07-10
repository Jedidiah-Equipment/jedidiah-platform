import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';

import { createAiSdkTools } from './ai-sdk-tools.js';
import type { AiV2Context } from './context.js';

function createContext(role: 'admin' | 'job-viewer' | 'sales'): AiV2Context {
  return {
    access: createUserAccessSummary({ role, userId: '00000000-0000-4000-8000-000000000001' }),
  } as AiV2Context;
}

function createContextWithPermissions(permissions: NonNullable<AiV2Context['access']>['permissions']): AiV2Context {
  return { access: { permissions } } as AiV2Context;
}

describe('createAiSdkTools v2', () => {
  test('exposes every v2 read and write workflow to an administrator', () => {
    expect(Object.keys(createAiSdkTools(createContext('admin')))).toEqual([
      'findProducts',
      'getProduct',
      'findCustomers',
      'getCustomer',
      'createCustomer',
      'patchCustomer',
      'findQuotes',
      'getQuote',
      'createQuote',
      'patchQuote',
      'findJobs',
      'getJob',
    ]);
  });

  test('exposes only tools allowed by the caller permissions', () => {
    expect(Object.keys(createAiSdkTools(createContext('sales')))).toEqual([
      'findProducts',
      'findCustomers',
      'findQuotes',
      'getQuote',
      'createQuote',
      'patchQuote',
    ]);
    expect(Object.keys(createAiSdkTools(createContext('job-viewer')))).toEqual(['findJobs', 'getJob']);
    expect(Object.keys(createAiSdkTools(createContextWithPermissions(['quote:create'])))).toEqual([
      'findProducts',
      'findCustomers',
      'createQuote',
    ]);
  });
});
