import type { ChatToolResultSizeInfo } from '@pkg/schema';

export type ToolResultSizeMap = Record<string, ChatToolResultSizeInfo>;

export type ToolResultSizeSummary = {
  removedThumbnailFieldsByFallback: number;
  totalSerializedBytes: number;
  truncatedCount: number;
};

export function getToolResultSizesFromMetadata(
  custom: Record<string, unknown> | undefined,
): ToolResultSizeMap | undefined {
  const toolResultSizes = custom?.toolResultSizes;

  if (!isRecord(toolResultSizes)) {
    return undefined;
  }

  return toolResultSizes as ToolResultSizeMap;
}

export function summarizeToolResultSizes(
  sizes: readonly (ChatToolResultSizeInfo | undefined)[],
): ToolResultSizeSummary | undefined {
  let matchedSizes = 0;
  let removedThumbnailFieldsByFallback = 0;
  let totalSerializedBytes = 0;
  let truncatedCount = 0;

  for (const size of sizes) {
    if (!size) {
      continue;
    }

    matchedSizes += 1;
    removedThumbnailFieldsByFallback += size.removedThumbnailFieldsByFallback;
    totalSerializedBytes += size.serializedBytes;

    if (size.truncated) {
      truncatedCount += 1;
    }
  }

  if (matchedSizes === 0) {
    return undefined;
  }

  return {
    removedThumbnailFieldsByFallback,
    totalSerializedBytes,
    truncatedCount,
  };
}

export function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function formatThumbnailDropCount(count: number): string {
  return `${count} thumbnail${count === 1 ? '' : 's'} dropped`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
