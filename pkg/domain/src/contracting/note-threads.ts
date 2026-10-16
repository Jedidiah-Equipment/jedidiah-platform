import type { AppRole, AuthId, PushKind, UserAccessSummary } from '@pkg/schema';
import type { JobStatus, NoteThreadKind } from '@pkg/schema/contracting';
import { getBusinessRole } from '../auth/authorization.js';
import { breakdownFirstLine, canReadBreakdown, isBreakdownMine } from './breakdowns.js';
import { canReadJob } from './jobs.js';
import type { ContractingPushContent, ContractingPushEvent } from './notifications.js';
import { alertFor } from './push-alert.js';

/** What each thread kind's reach rule reads off its record. */
export type NoteThreadRecord = {
  job: { status: JobStatus; foremanUserId: AuthId | null };
  breakdown: { reportedByUserId: AuthId; jobForemanUserId: AuthId | null };
};

type NoteThread<K extends NoteThreadKind> = {
  pushKind: PushKind;
  /** Where tapping the push lands: the record's Activity tab. */
  path: (id: string) => string;
  /** Roles that reach every entry of this kind, whether or not they took part. */
  alwaysReaches: readonly AppRole[];
  /** Whether the thread's record still lets this person read it; who else is reached is judged by `noteReaches`. */
  canRead: (access: UserAccessSummary, record: NoteThreadRecord[K]) => boolean;
  /** The people the record itself names: a Job's Foreman; a Breakdown's reporter and its Job's Foreman. */
  involves: (record: NoteThreadRecord[K], userId: AuthId) => boolean;
};

// Typed as a mapped type, not `satisfies`, so `noteThreads[kind]` reads as `NoteThread<K>` for a generic kind.
export const noteThreads: { [K in NoteThreadKind]: NoteThread<K> } = {
  job: {
    pushKind: 'contracting.job-note',
    path: (id) => `/contracting/jobs/${id}?tab=activity`,
    alwaysReaches: ['contracting-manager', 'contracting-admin', 'super-admin'],
    canRead: canReadJob,
    involves: (job, userId) => job.foremanUserId === userId,
  },
  breakdown: {
    pushKind: 'contracting.breakdown-note',
    path: (id) => `/contracting/workshop/${id}?tab=activity`,
    alwaysReaches: ['workshop-manager'],
    canRead: canReadBreakdown,
    involves: isBreakdownMine,
  },
};

/**
 * Whether a new entry reaches this person: they can still read the record, and they hold an always-reaches role,
 * are named by the record, or have noted the thread before. The author is excluded upstream, in dispatch.
 */
export function noteReaches<K extends NoteThreadKind>(
  kind: K,
  access: UserAccessSummary,
  record: NoteThreadRecord[K],
  authorIds: readonly AuthId[],
): boolean {
  const thread = noteThreads[kind];
  if (!thread.canRead(access, record)) return false;
  const role = getBusinessRole(access, 'contracting');
  return (
    (role !== null && thread.alwaysReaches.includes(role)) ||
    thread.involves(record, access.userId) ||
    authorIds.includes(access.userId)
  );
}

/** The push event for a new entry; the edge schedules it and never spells it. */
export const noteAdded = (thread: NoteThreadKind, noteId: string): ContractingPushEvent => ({
  kind: 'note.added',
  thread,
  noteId,
});

export function notePushMessage(note: {
  kind: NoteThreadKind;
  id: string;
  code: string;
  authorName: string;
  text: string;
}): ContractingPushContent {
  const thread = noteThreads[note.kind];
  // Leave room for author, title and navigation in the provider's 4 KiB payload.
  const preview = breakdownFirstLine(note.text, 241);
  return {
    title: `Note · ${note.code}`,
    body: `${note.authorName}: ${preview}`,
    data: { business: 'contracting', kind: note.kind, id: note.id, path: thread.path(note.id) },
    ...alertFor(thread.pushKind),
  };
}
