import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';

import { createAiSdkTools } from './ai-sdk-tools.js';
import type { AiV2Context } from './context.js';

function createContext(role: 'admin' | 'sales'): AiV2Context {
  return {
    access: createUserAccessSummary({ role, userId: '00000000-0000-4000-8000-000000000001' }),
  } as AiV2Context;
}

describe('createAiSdkTools v2', () => {
  test('exposes only the copied listProducts tool to an authorized caller', () => {
    expect(Object.keys(createAiSdkTools(createContext('admin')))).toEqual(['listProducts']);
  });

  test('does not expose listProducts without product read permission', () => {
    expect(createAiSdkTools(createContext('sales'))).toEqual({});
  });

  test('honors an explicitly empty include list', () => {
    expect(createAiSdkTools(createContext('admin'), { include: [] })).toEqual({});
  });
});
