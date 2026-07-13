import { z } from 'zod';

export const LOCALES = ['en', 'af'] as const;

export type Locale = z.infer<typeof Locale>;
export const Locale = z.enum(LOCALES);

export const CANONICAL_LOCALE = 'en' satisfies Locale;
