import { z } from 'zod';

export const LOCALES = ['en', 'af'] as const;

export type Locale = z.infer<typeof Locale>;
export const Locale = z.enum(LOCALES);

export const CANONICAL_LOCALE = 'en' satisfies Locale;

// The locale the catalog machine-translation pipeline targets. `satisfies` pins it to a non-canonical
// member of LOCALES, so adding or renaming locales is a single edit in this file.
export const TRANSLATED_LOCALE = 'af' satisfies Exclude<Locale, typeof CANONICAL_LOCALE>;
