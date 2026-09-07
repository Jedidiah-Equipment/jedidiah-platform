import { MockLanguageModelV4 } from 'ai/test';
import { expect, test } from 'vitest';
import { readMeterPhoto } from './meter-reading.js';

test('reads the hour meter without using the foreman value as a hint', async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: JSON.stringify({ value: 1234.5, confidence: 0.92 }) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: [],
    }),
  });
  expect(await readMeterPhoto({ model, bytes: new Uint8Array([255, 216, 255]), contentType: 'image/jpeg' })).toEqual({
    value: 1234.5,
    confidence: 0.92,
  });
});
