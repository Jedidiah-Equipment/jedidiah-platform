import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export type TranslatableProductFields = {
  category: string | null;
  description: string | null;
  keyFeatures: readonly string[];
  name: string;
  nameHighlight: string | null;
  technicalDetails: readonly { label: string; value: string }[];
};

export type TranslatableAssemblyFields = { id: string; name: string };

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

  return bytesToHex(sha256(utf8ToBytes(JSON.stringify(canonicalText))));
}

export function isTranslationStale(currentHash: string, translation: { sourceHash: string } | undefined): boolean {
  return translation !== undefined && translation.sourceHash !== currentHash;
}

export function selectTranslated<T>(canonical: T, translated: T | null | undefined): T {
  return translated ?? canonical;
}
