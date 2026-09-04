/**
 * A translated catalog field as stored in a `translations` jsonb column: the value plus who owns it
 * (`isManual`) and the hash of the English Canonical Text it was produced from.
 *
 * Declared structurally here rather than imported from `@pkg/schema` so the inferred Drizzle row types
 * stay portable into `@pkg/api`'s emitted declarations (TS2883) — the same constraint that keeps
 * `StoredFile` inline on the image columns. `@pkg/schema` owns the validated shape; these must agree.
 */
export type TranslationEnvelope<Value> = {
  isManual: boolean;
  sourceHash: string;
  translatedAt: string;
  value: Value;
};

/** A `translations` column: locale -> the entity's translated fields, each field independently absent. */
export type TranslationsColumn<Fields> = Partial<Record<string, Partial<Fields>>>;
