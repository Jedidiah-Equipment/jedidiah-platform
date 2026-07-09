import { z } from 'zod';

export function requiredTrimmedText(message?: string) {
  const schema = z.string().trim();
  return message ? schema.min(1, message) : schema.min(1);
}

export function nullableTrimmedText() {
  return requiredTrimmedText().nullable();
}

export function nullableTrimmedTextInput() {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null);
}

// Like {@link nullableTrimmedTextInput} but omittable: an absent key stays `undefined` (so callers can
// distinguish "not provided / preserve" from an explicit `null`/blank that clears the value).
export function nullableTrimmedTextInputOptional() {
  return z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
}

export function nullableEmailInput(message = 'Enter a valid email address') {
  return z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .default(null)
    .pipe(z.email(message).nullable());
}

// Like {@link nullableEmailInput} but omittable: an absent key stays `undefined` (preserve), while an
// explicit `null` or blank clears the value.
export function nullableEmailInputOptional(message = 'Enter a valid email address') {
  return z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()
    .pipe(z.email(message).nullable().optional());
}

export type EmailAddress = z.infer<typeof EmailAddress>;
export const EmailAddress = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export type SearchText = z.infer<typeof SearchText>;
export const SearchText = z.string().trim().default('');
