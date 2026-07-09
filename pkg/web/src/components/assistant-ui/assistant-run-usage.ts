import type { ChatRunUsage } from '@pkg/schema';

export function getRunUsageFromMetadata(custom: Record<string, unknown> | undefined): ChatRunUsage | undefined {
  const runUsage = custom?.runUsage;

  if (!isRecord(runUsage)) {
    return undefined;
  }

  return runUsage as ChatRunUsage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
