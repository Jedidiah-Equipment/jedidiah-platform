import { type Db, user } from '@pkg/db';
import {
  contractingBreakdownNotes,
  contractingBreakdowns,
  contractingJobNotes,
  contractingJobs,
} from '@pkg/db/contracting';
import { createUserAccessSummaryForUser, PUSH_KINDS } from '@pkg/domain';
import {
  breakdownNoteReaches,
  breakdownPushKind,
  breakdownPushMessage,
  type ContractingPushContent,
  type ContractingPushEvent,
  formatJobNumber,
  jobNoteReaches,
  notePushMessage,
  SERVICE_DUE_SOON_PUSH_KIND,
  serviceDueNeedsAttention,
  serviceDueSoonPushMessage,
} from '@pkg/domain/contracting';
import type { PushKind, UserAccessSummary } from '@pkg/schema';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { deliverPush, type PushDelivery, type PushMessage, type PushSender } from '../../push/push-sender.js';
import { listPushTokensForUsers } from '../../push/push-token-service.js';
import { businessRoleSql } from '../../users/business-role.js';
import { selectBreakdowns, toBreakdownSummary } from '../breakdowns/breakdown-load.js';
import { getMachine } from '../fleet/machine-service.js';

/**
 * The people holding a role the kind can reach who have not muted it and whom `reaches` keeps: never a shared device
 * or a banned account, and never the actor.
 */
async function recipientUserIds(
  db: Db,
  kind: PushKind,
  excludeUserId: string | null,
  reaches: (access: UserAccessSummary) => boolean,
) {
  const { business, roles } = PUSH_KINDS[kind];
  const rows = await db
    .select({ id: user.id, role: user.role, contractingRole: user.contractingRole })
    .from(user)
    .where(
      and(
        eq(user.isDevice, false),
        sql`${user.banned} is not true`,
        inArray(businessRoleSql(business), [...roles]),
        sql`not (${user.mutedPushKinds} @> ${JSON.stringify([kind])}::jsonb)`,
        excludeUserId === null ? undefined : ne(user.id, excludeUserId),
      ),
    );
  return rows.filter((row) => reaches(createUserAccessSummaryForUser(row))).map((row) => row.id);
}

async function addressed(
  db: Db,
  kind: PushKind,
  excludeUserId: string | null,
  content: ContractingPushContent,
  reaches: (access: UserAccessSummary) => boolean = () => true,
): Promise<PushMessage[]> {
  const tokens = await listPushTokensForUsers({
    db,
    userIds: await recipientUserIds(db, kind, excludeUserId, reaches),
  });
  return tokens.map(({ token }) => ({ to: token, ...content }));
}

async function breakdownNotePush(db: Db, noteId: string): Promise<PushMessage[]> {
  const [record] = await db
    .select({ note: contractingBreakdownNotes, authorName: user.name })
    .from(contractingBreakdownNotes)
    .innerJoin(user, eq(user.id, contractingBreakdownNotes.authorUserId))
    .where(eq(contractingBreakdownNotes.id, noteId));
  if (!record) return [];
  const { note, authorName } = record;
  const [[row], authors] = await Promise.all([
    selectBreakdowns(db).where(eq(contractingBreakdowns.id, note.breakdownId)).limit(1),
    db
      .selectDistinct({ id: contractingBreakdownNotes.authorUserId })
      .from(contractingBreakdownNotes)
      .where(eq(contractingBreakdownNotes.breakdownId, note.breakdownId)),
  ]);
  if (!row) return [];
  const breakdown = toBreakdownSummary(row);
  const authorIds = authors.map(({ id }) => id);
  return addressed(
    db,
    'contracting.breakdown-note',
    note.authorUserId,
    notePushMessage({ kind: 'breakdown', id: breakdown.id, code: breakdown.subject.code, authorName, text: note.text }),
    (access) => breakdownNoteReaches(access, breakdown, authorIds),
  );
}

async function jobNotePush(db: Db, noteId: string): Promise<PushMessage[]> {
  const [record] = await db
    .select({ note: contractingJobNotes, authorName: user.name, job: contractingJobs })
    .from(contractingJobNotes)
    .innerJoin(user, eq(user.id, contractingJobNotes.authorUserId))
    .innerJoin(contractingJobs, eq(contractingJobs.id, contractingJobNotes.jobId))
    .where(eq(contractingJobNotes.id, noteId));
  if (!record) return [];
  const { note, authorName, job } = record;
  const authors = await db
    .selectDistinct({ id: contractingJobNotes.authorUserId })
    .from(contractingJobNotes)
    .where(eq(contractingJobNotes.jobId, job.id));
  const authorIds = authors.map(({ id }) => id);
  return addressed(
    db,
    'contracting.job-note',
    note.authorUserId,
    notePushMessage({ kind: 'job', id: job.id, code: formatJobNumber(job.code), authorName, text: note.text }),
    (access) => jobNoteReaches(access, job, authorIds),
  );
}

async function breakdownReportedPush(db: Db, breakdownId: string): Promise<PushMessage[]> {
  // Actor-blind on purpose: the push goes out on the server's behalf, not the reporter's.
  const [row] = await selectBreakdowns(db).where(eq(contractingBreakdowns.id, breakdownId)).limit(1);
  if (!row) return [];
  const breakdown = toBreakdownSummary(row);
  return addressed(
    db,
    breakdownPushKind(breakdown.urgency),
    breakdown.reportedByUserId,
    breakdownPushMessage({ ...breakdown, subjectCode: breakdown.subject.code }),
  );
}

async function serviceDueSoonPush(db: Db, machineId: string): Promise<PushMessage[]> {
  const machine = await getMachine({ db, id: machineId });
  // Queued work runs after commit: a service closed in between, or a raised threshold, leaves nothing to say.
  // The Machine read already judged its status against the Service Due Soon threshold in Settings.
  if (machine.hoursToService === null || !serviceDueNeedsAttention(machine.serviceDueStatus)) return [];
  // Nobody is excluded: the capturer is usually a Foreman, and a workshop manager who captured it still wants it.
  return addressed(
    db,
    SERVICE_DUE_SOON_PUSH_KIND,
    null,
    serviceDueSoonPushMessage({ id: machine.id, code: machine.code, hoursToService: machine.hoursToService }),
  );
}

/** The messages one Contracting event turns into, one per token of everyone it should reach. */
export function buildContractingPush({ db, event }: { db: Db; event: ContractingPushEvent }): Promise<PushMessage[]> {
  switch (event.kind) {
    case 'breakdown.reported':
      return breakdownReportedPush(db, event.breakdownId);
    case 'machine.service-due-soon':
      return serviceDueSoonPush(db, event.machineId);
    case 'breakdown-note.added':
      return breakdownNotePush(db, event.noteId);
    case 'job-note.added':
      return jobNotePush(db, event.noteId);
  }
}

export async function dispatchContractingPush({
  db,
  event,
  sender,
}: {
  db: Db;
  event: ContractingPushEvent;
  sender: PushSender;
}): Promise<PushDelivery> {
  return deliverPush({ db, sender, messages: await buildContractingPush({ db, event }) });
}
