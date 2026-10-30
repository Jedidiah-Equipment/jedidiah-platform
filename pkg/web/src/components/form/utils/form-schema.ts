import { z } from 'zod';

/**
 * Browser form-field for an optional *numeric* field. `NumberField` renders a text input and holds
 * an empty control as `NaN`, so emptiness is the one rule this adds — sign, bounds and decimal
 * places all stay owned by the `@pkg/schema` leaf, which the browser does not re-state.
 */
export function optionalNumber<T extends z.ZodTypeAny>(schema: T) {
  return z.union([z.nan(), schema]);
}

/**
 * A `DateTimePickerField` value: blank, or a local 'YYYY-MM-DDTHH:mm'. A time typed wrong is held as typed, so this
 * refuses it and the form cannot submit an earlier time in its place.
 */
export const WRONG_TIME_MESSAGE = 'Enter the time as HH:mm, such as 07:30';
export const localDateTimeValue = z.union([
  z.literal(''),
  z.string().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, WRONG_TIME_MESSAGE),
]);

/** Maps the `NaN` an empty `NumberField` holds back to the `null` the API expects. */
export function nanToNull(value: number): number | null {
  return Number.isNaN(value) ? null : value;
}
