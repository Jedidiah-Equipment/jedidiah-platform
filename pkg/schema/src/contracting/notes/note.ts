import { z } from 'zod';
import { UUID } from '../../common/uuid.js';

export const noteThreadKinds = ['job', 'breakdown'] as const;
export const NoteThreadKind = z.enum(noteThreadKinds);
export type NoteThreadKind = z.infer<typeof NoteThreadKind>;

/** The text of one Note Thread entry, typed or from a Voice Note. */
export const NoteText = z.string().trim().min(1).max(4000);

/** One entry for a Note Thread: which kind of record, which one, and the text. */
export const NoteAddInput = z.object({ thread: NoteThreadKind, id: UUID, text: NoteText }).strict();
export type NoteAddInput = z.infer<typeof NoteAddInput>;
