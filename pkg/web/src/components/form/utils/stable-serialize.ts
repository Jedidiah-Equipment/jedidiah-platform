export function stableSerialize(value: unknown): string {
  return JSON.stringify(toStableSerializable(value));
}

function toStableSerializable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStableSerializable);
  }

  if (value instanceof Date) {
    return value.toJSON();
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, nestedValue]) => [key, toStableSerializable(nestedValue)]),
  );
}
