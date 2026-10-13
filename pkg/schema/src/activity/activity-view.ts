import { z } from 'zod';
import { DateIso } from '../common/date.js';

/** Each business's Activity View: the newest feed instant the user has received there. */
export const ActivityViewMap = z.object({ equipment: DateIso.optional(), contracting: DateIso.optional() }).strict();
export type ActivityViewMap = z.infer<typeof ActivityViewMap>;

/** The newest item a feed displayed, acknowledged as seen. */
export const ActivitySeenInput = z.object({ seenAt: DateIso }).strict();
export type ActivitySeenInput = z.infer<typeof ActivitySeenInput>;
