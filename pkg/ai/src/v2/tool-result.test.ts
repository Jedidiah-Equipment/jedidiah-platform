import { describe, expect, test } from 'vitest';

import { prepareToolResult } from './tool-result.js';

describe('prepareToolResult v2', () => {
  test('removes thumbnail data URLs recursively', () => {
    expect(
      prepareToolResult({
        items: [{ id: 'product-1', nested: { thumbnailDataUrl: 'data:image/png;base64,large' } }],
      }),
    ).toEqual({ items: [{ id: 'product-1', nested: {} }] });
  });

  test('keeps serialized tool output within the 24KB budget', () => {
    const result = prepareToolResult({
      items: Array.from({ length: 100 }, (_, index) => ({ index, text: 'x'.repeat(1_000) })),
    });

    expect(Buffer.byteLength(JSON.stringify(result), 'utf8')).toBeLessThanOrEqual(24 * 1024);
    expect(JSON.stringify(result)).toContain('__aiToolResultTruncatedItems');
  });
});
