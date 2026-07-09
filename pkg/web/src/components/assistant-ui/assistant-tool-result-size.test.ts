import type { ChatToolResultSizeInfo } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  formatKb,
  formatThumbnailDropCount,
  getToolResultSizesFromMetadata,
  summarizeToolResultSizes,
} from './assistant-tool-result-size.js';

describe('assistant tool result size helpers', () => {
  it('reads tool result sizes from assistant metadata', () => {
    const size = createSize({ serializedBytes: 1536 });

    expect(getToolResultSizesFromMetadata({ toolResultSizes: { 'tool-1': size } })).toEqual({ 'tool-1': size });
    expect(getToolResultSizesFromMetadata(undefined)).toBeUndefined();
    expect(getToolResultSizesFromMetadata({ toolResultSizes: null })).toBeUndefined();
  });

  it('summarizes serialized bytes and truncation across tool calls', () => {
    expect(
      summarizeToolResultSizes([
        createSize({ removedThumbnailFieldsByFallback: 2, serializedBytes: 1024, truncated: true }),
        undefined,
        createSize({ removedThumbnailFieldsByFallback: 1, serializedBytes: 512, truncated: false }),
      ]),
    ).toEqual({
      removedThumbnailFieldsByFallback: 3,
      totalSerializedBytes: 1536,
      truncatedCount: 1,
    });

    expect(summarizeToolResultSizes([undefined])).toBeUndefined();
  });

  it('formats byte and thumbnail labels', () => {
    expect(formatKb(1536)).toBe('1.5 KB');
    expect(formatThumbnailDropCount(1)).toBe('1 thumbnail dropped');
    expect(formatThumbnailDropCount(2)).toBe('2 thumbnails dropped');
  });
});

function createSize(overrides: Partial<ChatToolResultSizeInfo> = {}): ChatToolResultSizeInfo {
  return {
    maxSerializedBytes: 24 * 1024,
    removedThumbnailFieldsByFallback: 0,
    serializedBytes: 0,
    truncated: false,
    ...overrides,
  };
}
