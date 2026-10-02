export type ObservabilityProperty = string | number | boolean | null;
export type ObservabilityProperties = Record<string, ObservabilityProperty>;

export type MutationEventDefinition = {
  event: string;
  properties: (variables: unknown, data: unknown) => ObservabilityProperties;
};

export type MutationEventCatalog = Record<string, MutationEventDefinition>;

export function pickRecordIds(value: unknown, fields: readonly string[]): ObservabilityProperties {
  return pickStringFields(
    value,
    fields.map((field) => [field, field] as const),
  );
}

export function pickStringFields(
  value: unknown,
  fields: readonly (readonly [source: string, destination: string])[],
): ObservabilityProperties {
  if (typeof value !== 'object' || value === null) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    fields.flatMap(([from, to]) => (typeof source[from] === 'string' ? [[to, source[from]]] : [])),
  );
}
