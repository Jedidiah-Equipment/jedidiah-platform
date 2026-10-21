import type { ReactNode } from 'react';

export type SearchSelectFieldOption = {
  /** Second line under the label; search matches it too. */
  description?: string;
  /** Shown but not pickable, such as a Machine already on another Job. */
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  value: string;
};

/** Lets the person add a missing record by typing its name. */
export type SearchSelectCreate = {
  /** Creates the record and returns its id, which the field then picks; undefined leaves the list open. */
  onCreate: (name: string) => Promise<string | undefined>;
  /** The name the typed text would be stored as, or nothing when it is not one; defaults to a trim. */
  toName?: ((text: string) => string | undefined) | undefined;
};

/** A dropdown row: an option to pick, or the offer to create the typed name. */
export type SearchSelectRow = { kind: 'option'; option: SearchSelectFieldOption } | { kind: 'create'; name: string };

/**
 * The rows the open list shows for this search: every matching option, led by an offer to create the
 * typed name when the field can create and no option already carries that name.
 */
export function searchSelectRows(
  options: readonly SearchSelectFieldOption[],
  search: string,
  create?: Pick<SearchSelectCreate, 'toName'>,
): SearchSelectRow[] {
  const term = search.trim().toLowerCase();
  const matches = term
    ? options.filter((option) => [option.label, option.description].some((text) => text?.toLowerCase().includes(term)))
    : options;
  const rows = matches.map((option): SearchSelectRow => ({ kind: 'option', option }));
  if (!create) return rows;

  const name = create.toName ? create.toName(search) : search.trim() || undefined;
  if (!name || options.some((option) => option.label.toLowerCase() === name.toLowerCase())) return rows;
  return [{ kind: 'create', name }, ...rows];
}
