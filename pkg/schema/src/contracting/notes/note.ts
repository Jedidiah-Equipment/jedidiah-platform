import { z } from 'zod';

export const noteThreadKinds = ['job', 'breakdown'] as const;
export const NoteThreadKind = z.enum(noteThreadKinds);
export type NoteThreadKind = z.infer<typeof NoteThreadKind>;

/** The text of one Note Thread entry, typed or from a Voice Note. */
export const NoteText = z.string().trim().min(1).max(4000);
