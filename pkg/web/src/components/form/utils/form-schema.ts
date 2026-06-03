import { z } from 'zod';

type NonNullableSchema<T extends z.ZodTypeAny> = T extends z.ZodNullable<infer Inner> ? Inner : T;

/**
 * Browser form-field representation of an optional schema field. Controlled inputs hold
 * `''` for "no value", so this accepts the empty string and otherwise reuses the field's
 * own content rule from `@pkg/schema`. Pass either the nullable field or the bare scalar —
 * e.g. `emptyStringOr(QuoteNotes)` or `emptyStringOr(DateOnlyIso)`.
 */
export function emptyStringOr<T extends z.ZodTypeAny>(schema: T) {
  const content = (schema instanceof z.ZodNullable ? schema.unwrap() : schema) as NonNullableSchema<T>;
  return z.union([z.literal(''), content]);
}

/**
 * Browser form-field for a required selection (combobox/select) whose value must satisfy a
 * `@pkg/schema` scalar once chosen. The control holds `''` until the user picks something, so an
 * empty or otherwise invalid value fails with `message` — e.g. `requiredSelection(UUID, 'Select a product')`.
 */
export function requiredSelection<T extends z.ZodTypeAny>(schema: T, message: string) {
  return z.string().refine((value) => schema.safeParse(value).success, message);
}
