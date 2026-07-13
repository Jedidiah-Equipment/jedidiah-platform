import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export type CatalogTranslationKey = `product:${string}` | `product_range:${string}` | `product_range_variant:${string}`;

export type TranslatableProductFields = {
  category: string | null;
  description: string | null;
  keyFeatures: readonly string[];
  name: string;
  nameHighlight: string | null;
  technicalDetails: readonly { label: string; value: string }[];
};

export type TranslatableAssemblyFields = { id: string; name: string };

export type TranslatableProductRangeFields = { description: string | null; name: string };

export type TranslatableProductRangeVariantFields = { name: string };

export function productSourceHash(
  product: TranslatableProductFields,
  assemblies: readonly TranslatableAssemblyFields[],
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

export function selectTranslated<T>(canonical: T, translated: T | null | undefined): T {
  return translated ?? canonical;
}

export function translationForLocale<T>(
  translations: Partial<Record<string, T>> | undefined,
  locale: string,
): T | undefined {
  return locale === 'en' ? undefined : translations?.[locale];
}

function catalogSourceHash(canonicalText: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(canonicalText))));
}
