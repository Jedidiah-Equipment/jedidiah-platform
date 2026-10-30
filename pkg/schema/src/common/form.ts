import { z } from 'zod';

/**
 * A form field for a required choice (picker, select, combobox) whose value must satisfy a scalar once chosen. The
 * control holds `''` until something is picked, so an empty or otherwise invalid value fails with `message` — e.g.
 * `requiredSelection(UUID, 'Select a product')`.
 */
export function requiredSelection<T extends z.ZodTypeAny>(schema: T, message: string) {
  return z.string().refine((value) => schema.safeParse(value).success, message);
}

type NonNullableSchema<T extends z.ZodTypeAny> = T extends z.ZodNullable<infer Inner> ? Inner : T;

/**
 * A form field for an optional value. Controlled inputs hold `''` for "no value", so this accepts the empty string and
 * otherwise reuses the field's own content rule. Pass either the nullable field or the bare scalar — e.g.
 * `emptyStringOr(QuoteNotes)` or `emptyStringOr(DateOnlyIso)`; the write maps `''` back to `null`.
 */
export function emptyStringOr<T extends z.ZodTypeAny>(schema: T) {
  const content = (schema instanceof z.ZodNullable ? schema.unwrap() : schema) as NonNullableSchema<T>;
  return z.union([z.literal(''), content]);
}
