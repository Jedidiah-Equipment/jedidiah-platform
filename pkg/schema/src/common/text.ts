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

const WHITESPACE_RUN = /[ \t\n\r\f\v]+/g;

/** Inner runs of whitespace collapsed to one space, so two spacings of a name cannot read as two names. */
export function collapseWhitespaceRuns(text: string): string {
  return text.replaceAll(WHITESPACE_RUN, ' ');
}

/**
 * How an import decides that a CSV cell and a stored name mean the same thing: the stored shape of
 * the name with its whitespace runs collapsed and its casing folded. It never touches what is
 * stored, and anything looser than this ("Night Wolves" against "Nightwolves") is a merge somebody
 * has to decide on.
 *
 * Whitespace is pinned to the class Postgres agrees on, spelled out rather than `\s` because
 * Postgres does not count a non-breaking space as whitespace. Casing is not pinned, and cannot be:
 * Postgres `lower` and JavaScript `toLowerCase` part company on a few letters, so a name using one
 * of them can still be missed and duplicated. Pinning the fold to ASCII would trade that rare miss
 * for a common one, since every accented name matches correctly today.
 */
export function nameLookupKey(name: string): string {
  return collapseWhitespaceRuns(name).replaceAll(/^ | $/g, '').toLowerCase();
}

export type EmailAddress = z.infer<typeof EmailAddress>;
export const EmailAddress = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'));

export type SearchText = z.infer<typeof SearchText>;
export const SearchText = z.string().trim().default('');
