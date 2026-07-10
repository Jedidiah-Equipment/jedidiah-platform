const MAX_SERIALIZED_BYTES = 24 * 1024;
const ARRAY_TRUNCATION_MARKER_KEY = '__aiToolResultTruncatedItems';
const RESULT_TRUNCATION_MARKER_KEY = '__aiToolResultTruncated';

export function prepareToolResult(result: unknown): unknown {
  const stripped = stripThumbnailDataUrls(result);
  return enforceSerializedResultBudget(stripped, MAX_SERIALIZED_BYTES);
}

function stripThumbnailDataUrls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripThumbnailDataUrls);
  }

  if (value instanceof Date || !isObjectRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.toLowerCase().endsWith('thumbnaildataurl'))
      .map(([key, item]) => [key, stripThumbnailDataUrls(item)]),
  );
}

function enforceSerializedResultBudget(value: unknown, maxSerializedBytes: number): unknown {
  let candidate = value;
  let serializedBytes = getSerializedBytes(candidate);

  for (let attempt = 0; attempt < 100 && serializedBytes > maxSerializedBytes; attempt += 1) {
    const largestArrayPath = findLargestReducibleArrayPath(candidate);

    if (!largestArrayPath) {
      break;
    }

    candidate = truncateArrayAtPath(candidate, largestArrayPath);
    serializedBytes = getSerializedBytes(candidate);
  }

  if (serializedBytes <= maxSerializedBytes) {
    return candidate;
  }

  return {
    [RESULT_TRUNCATION_MARKER_KEY]: true,
    message: `Tool result exceeded ${maxSerializedBytes} serialized bytes after projection.`,
    originalSerializedBytes: getSerializedBytes(value),
  };
}

function findLargestReducibleArrayPath(value: unknown): Array<string | number> | null {
  const arrays: Array<{ path: Array<string | number>; savedBytes: number }> = [];
  collectReducibleArrayPaths(value, [], arrays);
  arrays.sort((a, b) => b.savedBytes - a.savedBytes);
  return arrays[0]?.path ?? null;
}

function collectReducibleArrayPaths(
  value: unknown,
  path: Array<string | number>,
  arrays: Array<{ path: Array<string | number>; savedBytes: number }>,
): boolean {
  if (Array.isArray(value)) {
    let hasReducibleDescendant = false;

    for (const [index, item] of value.entries()) {
      hasReducibleDescendant = collectReducibleArrayPaths(item, [...path, index], arrays) || hasReducibleDescendant;
    }

    const savedBytes = getSerializedBytes(value) - getSerializedBytes(truncateArray(value));
    const isReducible = getTruncatableArrayItems(value).length > 0 && savedBytes > 0;

    if (isReducible && !hasReducibleDescendant) {
      arrays.push({ path, savedBytes });
    }

    return isReducible || hasReducibleDescendant;
  }

  if (!isObjectRecord(value)) {
    return false;
  }

  return Object.entries(value).reduce(
    (hasReducibleDescendant, [key, item]) =>
      collectReducibleArrayPaths(item, [...path, key], arrays) || hasReducibleDescendant,
    false,
  );
}

function truncateArrayAtPath(value: unknown, path: readonly (string | number)[]): unknown {
  if (path.length === 0) {
    return Array.isArray(value) ? truncateArray(value) : value;
  }

  const [head, ...tail] = path;

  if (Array.isArray(value) && typeof head === 'number') {
    return value.map((item, index) => (index === head ? truncateArrayAtPath(item, tail) : item));
  }

  if (isObjectRecord(value) && typeof head === 'string') {
    return { ...value, [head]: truncateArrayAtPath(value[head], tail) };
  }

  return value;
}

function truncateArray(value: readonly unknown[]): unknown[] {
  const existingMarker = getArrayTruncationMarker(value.at(-1));
  const items = getTruncatableArrayItems(value);
  const keepCount = Math.floor(items.length / 2);
  const omittedItems = items.length - keepCount + (existingMarker?.omittedItems ?? 0);

  return [...items.slice(0, keepCount), createArrayTruncationMarker(omittedItems)];
}

function getTruncatableArrayItems(value: readonly unknown[]): readonly unknown[] {
  return getArrayTruncationMarker(value.at(-1)) ? value.slice(0, -1) : value;
}

function createArrayTruncationMarker(omittedItems: number): Record<string, unknown> {
  return {
    [ARRAY_TRUNCATION_MARKER_KEY]: omittedItems,
    message: `${omittedItems} item${omittedItems === 1 ? '' : 's'} omitted to keep the tool result within the assistant context budget.`,
  };
}

function getArrayTruncationMarker(value: unknown): { omittedItems: number } | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  const omittedItems = value[ARRAY_TRUNCATION_MARKER_KEY];
  return typeof omittedItems === 'number' ? { omittedItems } : null;
}

function getSerializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8');
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
