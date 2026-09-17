export type ObservabilityProperty = string | number | boolean | null;
export type ObservabilityProperties = Record<string, ObservabilityProperty>;

export type MutationEventDefinition = {
  event: string;
  properties: (variables: unknown, data: unknown) => ObservabilityProperties;
};

export type MutationEventCatalog = Record<string, MutationEventDefinition>;
