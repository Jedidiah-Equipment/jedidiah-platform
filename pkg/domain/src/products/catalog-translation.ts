import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  CANONICAL_LOCALE,
  type Locale,
  type TranslatableAssembly,
  type TranslatableProductFields,
  type TranslatableProductRangeFields,
  type TranslatableProductRangeVariantFields,
} from '@pkg/schema';

export type {
  TranslatableAssembly,
  TranslatableProductFields,
  TranslatableProductRangeFields,
  TranslatableProductRangeVariantFields,
} from '@pkg/schema';

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

export function productSourceHash(
  product: TranslatableProductFields,
  assemblies: readonly TranslatableAssembly[],
): string {
  const canonicalText = [
    product.name,
    product.nameHighlight,
    product.category,
    product.description,
    product.keyFeatures,
    product.technicalDetails.map(({ label, value }) => [label, value]),
    assemblies.toSorted((left, right) => left.id.localeCompare(right.id)).map(({ name }) => name),
  ];

  return catalogSourceHash(canonicalText);
}

export function productRangeSourceHash(range: TranslatableProductRangeFields): string {
  return catalogSourceHash([range.name, range.description]);
}

export function productRangeVariantSourceHash(variant: TranslatableProductRangeVariantFields): string {
  return catalogSourceHash([variant.name]);
}

export function isTranslationStale(currentHash: string, translation: { sourceHash: string } | undefined): boolean {
  return translation !== undefined && translation.sourceHash !== currentHash;
}

export type CatalogTranslationState = 'fresh' | 'missing' | 'stale';

// A translation unit is only as fresh as its weakest member: for a product bundle, any assembly missing
// its translation marks the whole unit missing, and any stale member taints it stale.
export function catalogTranslationState(
  sourceHash: string,
  translations: ReadonlyArray<{ sourceHash: string } | undefined>,
): CatalogTranslationState {
  if (translations.some((translation) => translation === undefined)) return 'missing';

  return translations.some((translation) => isTranslationStale(sourceHash, translation)) ? 'stale' : 'fresh';
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
  translations: Partial<Record<string, Partial<T>>> | undefined,
  locale: Locale,
): T {
  const translation = translationForLocale(translations, locale);
  if (!translation) return canonical;

  return Object.fromEntries(
    (Object.entries(canonical) as [keyof T & string, T[keyof T]][]).map(([key, value]) => [
      key,
      translation[key] ?? value,
    ]),
  ) as T;
}

function catalogSourceHash(canonicalText: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(canonicalText))));
}
