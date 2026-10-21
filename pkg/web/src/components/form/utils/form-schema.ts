import { z } from 'zod';

export { requiredSelection } from '@pkg/schema';

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
 * Browser form-field for an optional *numeric* field. `NumberField` renders a text input and holds
 * an empty control as `NaN`, so emptiness is the one rule this adds — sign, bounds and decimal
 * places all stay owned by the `@pkg/schema` leaf, which the browser does not re-state.
 */
export function optionalNumber<T extends z.ZodTypeAny>(schema: T) {
  return z.union([z.nan(), schema]);
}

/** Maps the `NaN` an empty `NumberField` holds back to the `null` the API expects. */
export function nanToNull(value: number): number | null {
  return Number.isNaN(value) ? null : value;
}
