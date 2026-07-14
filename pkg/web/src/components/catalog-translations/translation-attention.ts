import type { CatalogTranslationFieldState } from '@pkg/schema';

/** Any field that is not fresh — missing, stale, or awaiting human review — wants an admin's eyes. */
export function translationFieldsNeedAttention(
  fields: Record<string, { state: CatalogTranslationFieldState }>,
): boolean {
  return Object.values(fields).some((field) => field.state !== 'fresh');
}
