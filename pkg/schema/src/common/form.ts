import { z } from 'zod';

/**
 * A form field for a required choice (picker, select, combobox) whose value must satisfy a scalar once chosen. The
 * control holds `''` until something is picked, so an empty or otherwise invalid value fails with `message` — e.g.
 * `requiredSelection(UUID, 'Select a product')`.
 */
export function requiredSelection<T extends z.ZodTypeAny>(schema: T, message: string) {
  return z.string().refine((value) => schema.safeParse(value).success, message);
}
