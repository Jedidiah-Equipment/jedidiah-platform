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

export type EmailAddress = z.infer<typeof EmailAddress>;
export const EmailAddress = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export type SearchText = z.infer<typeof SearchText>;
export const SearchText = z.string().trim().default('');
