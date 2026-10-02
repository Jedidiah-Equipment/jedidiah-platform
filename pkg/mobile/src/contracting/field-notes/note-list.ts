import type { FieldNote } from './store';

export type FieldNoteStatusFilter = FieldNote['status'];

/** The Notes list: one status at a time, matching the search anywhere in the description, newest first. */
export function visibleFieldNotes<Note extends Pick<FieldNote, 'status' | 'createdAt' | 'description'>>(
  notes: readonly Note[],
  { status, search }: { status: FieldNoteStatusFilter; search: string },
): Note[] {
  const term = search.trim().toLowerCase();
  return notes
    .filter((note) => note.status === status && (!term || note.description.toLowerCase().includes(term)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
