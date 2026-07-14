import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  CANONICAL_LOCALE,
  type CatalogTranslationEnvelope,
  type CatalogTranslationFieldState,
  type Locale,
} from '@pkg/schema';

export type { CatalogTranslationEnvelope } from '@pkg/schema';

const CATALOG_TRANSLATION_KINDS = ['product', 'range', 'variant'] as const;

export type CatalogTranslationKind = (typeof CATALOG_TRANSLATION_KINDS)[number];

const CATALOG_TRANSLATION_KEY_PREFIXES = {
  product: 'product',
  range: 'product_range',
  variant: 'product_range_variant',
} as const satisfies Record<CatalogTranslationKind, string>;

type CatalogTranslationKeyPrefixes = typeof CATALOG_TRANSLATION_KEY_PREFIXES;

export type CatalogTranslationKeyFor<Kind extends CatalogTranslationKind> =
  `${CatalogTranslationKeyPrefixes[Kind]}:${string}`;

export type CatalogTranslationKey = CatalogTranslationKeyFor<CatalogTranslationKind>;

export function catalogTranslationKey<Kind extends CatalogTranslationKind>(
  kind: Kind,
  id: string,
): CatalogTranslationKeyFor<Kind> {
  return `${CATALOG_TRANSLATION_KEY_PREFIXES[kind]}:${id}`;
}

export function parseCatalogTranslationKey(key: CatalogTranslationKey): { id: string; kind: CatalogTranslationKind } {
  const separator = key.indexOf(':');
  const prefix = separator === -1 ? '' : key.slice(0, separator);
  const kind = CATALOG_TRANSLATION_KINDS.find((candidate) => CATALOG_TRANSLATION_KEY_PREFIXES[candidate] === prefix);
  if (!kind) throw new Error(`Malformed catalog translation key: ${key}`);

  return { id: key.slice(separator + 1), kind };
}

export type CatalogSourceHashes<Canonical extends object> = { [Field in keyof Canonical]: string };

export function catalogSourceHashes<Canonical extends object>(canonical: Canonical): CatalogSourceHashes<Canonical> {
  return Object.fromEntries(
    (Object.entries(canonical) as [keyof Canonical & string, Canonical[keyof Canonical]][]).map(([field, value]) => [
      field,
      catalogSourceHash(value),
    ]),
  ) as CatalogSourceHashes<Canonical>;
}

export type CatalogTranslationState = CatalogTranslationFieldState;

export function catalogTranslationFieldState(
  sourceHash: string,
  translation: Pick<CatalogTranslationEnvelope<unknown>, 'isManual' | 'sourceHash'> | undefined,
): CatalogTranslationState {
  if (!translation) return 'missing';
  if (translation.sourceHash === sourceHash) return 'fresh';
  return translation.isManual ? 'needsReview' : 'stale';
}

// Queueable states win so a mixed entity still enters the AI pipeline; a pure manual mismatch stays
// review-only and cannot loop through translation recovery.
export function catalogTranslationState(fieldStates: readonly CatalogTranslationState[]): CatalogTranslationState {
  if (fieldStates.includes('missing')) return 'missing';
  if (fieldStates.includes('stale')) return 'stale';
  return fieldStates.includes('needsReview') ? 'needsReview' : 'fresh';
}

export function catalogTranslationNeedsAi(state: CatalogTranslationState): boolean {
  return state === 'missing' || state === 'stale';
}

export function translationForLocale<T>(
  translations: Partial<Record<string, T>> | undefined,
  locale: Locale,
): T | undefined {
  return locale === CANONICAL_LOCALE ? undefined : translations?.[locale];
}

// Overlays the stored translation for a locale onto the canonical fields. Translations mirror the
// canonical field shape, so any absent or null translated field falls back to its canonical value.
export function localizeFields<T extends object>(
  canonical: T,
  translations:
    | Partial<Record<string, Partial<{ [Field in keyof T]: CatalogTranslationEnvelope<T[Field]> | undefined }>>>
    | undefined,
  locale: Locale,
): T {
  const translation = translationForLocale(translations, locale);
  if (!translation) return canonical;

  return Object.fromEntries(
    (Object.entries(canonical) as [keyof T & string, T[keyof T]][]).map(([key, value]) => [
      key,
      translation[key]?.value ?? value,
    ]),
  ) as T;
}

// Hashes one field's Canonical Text. Values are hashed as stored, so callers must pass DB-read or
// schema-parsed values: JSON.stringify is key-order sensitive, and an object built with a different key
// order would hash differently despite being equal content.
export function catalogSourceHash(canonicalText: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(canonicalText))));
}
