import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { UUID } from '../../common/uuid.js';
import { NoteText } from '../notes/note.js';

export const JobNoteCreateInput = z.object({ jobId: UUID, text: NoteText }).strict();
export type JobNoteCreateInput = z.infer<typeof JobNoteCreateInput>;
export const JobNote = z.object({
  id: UUID,
  jobId: UUID,
  authorUserId: AuthId,
  authorName: z.string(),
  text: NoteText,
  createdAt: DateIso,
});
export type JobNote = z.infer<typeof JobNote>;
