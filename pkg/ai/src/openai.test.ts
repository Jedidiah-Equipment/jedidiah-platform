import { describe, expect, test } from 'vitest';
import { toChatRunUsage } from './openai.js';

describe('toChatRunUsage', () => {
  test('maps aggregate and per-request SDK usage details', () => {
    expect(
      toChatRunUsage({
        inputTokens: 300,
        inputTokensDetails: [{ cached_tokens: 12 }, { cached_tokens: 8 }, { other: 99 }],
        outputTokens: 80,
        outputTokensDetails: [{ reasoning_tokens: 20 }, { reasoning_tokens: 5 }],
        requestUsageEntries: [
          {
            inputTokens: 200,
            inputTokensDetails: { cached_tokens: 12 },
            outputTokens: 40,
            outputTokensDetails: { reasoning_tokens: 20 },
            totalTokens: 240,
          },
          {
            inputTokens: 100,
            inputTokensDetails: {},
            outputTokens: 40,
            outputTokensDetails: {},
            totalTokens: 140,
          },
        ],
        requests: 2,
        totalTokens: 380,
      }),
    ).toEqual({
      cachedInputTokens: 20,
      inputTokens: 300,
      outputTokens: 80,
      reasoningOutputTokens: 25,
      requestUsage: [
        {
          cachedInputTokens: 12,
          inputTokens: 200,
          outputTokens: 40,
          reasoningOutputTokens: 20,
          totalTokens: 240,
        },
        {
          cachedInputTokens: 0,
          inputTokens: 100,
          outputTokens: 40,
          reasoningOutputTokens: 0,
          totalTokens: 140,
        },
      ],
      requests: 2,
      totalTokens: 380,
    });
  });

  test('uses an empty per-request list when the SDK has no entries', () => {
    expect(
      toChatRunUsage({
        inputTokens: 10,
        inputTokensDetails: [],
        outputTokens: 5,
        outputTokensDetails: [],
        requestUsageEntries: undefined,
        requests: 1,
        totalTokens: 15,
      }).requestUsage,
    ).toEqual([]);
  });
});
