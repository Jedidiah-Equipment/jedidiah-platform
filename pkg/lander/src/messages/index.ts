import { createContext, createElement, type ReactNode, useContext } from 'react';
import type { Locale } from '../lib/locale.js';
import { CANONICAL_LOCALE } from '../lib/locale.js';

import { af } from './af.js';
import { en } from './en.js';
import type { Messages } from './types.js';

const messagesByLocale: Record<Locale, Messages> = { en, af };
const LocaleContext = createContext<Locale>(CANONICAL_LOCALE);

export function messagesForLocale(locale: Locale): Messages {
  return messagesByLocale[locale];
}

export function LocaleProvider({ children, locale }: { children: ReactNode; locale: Locale }) {
  return createElement(LocaleContext.Provider, { value: locale }, children);
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useMessages(): Messages {
  return messagesForLocale(useLocale());
}
