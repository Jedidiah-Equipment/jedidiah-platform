import { type Db, user } from '@pkg/db';
import {
  contractingBreakdownNotes,
  contractingBreakdowns,
  contractingJobNotes,
  contractingJobs,
} from '@pkg/db/contracting';
import { PUSH_KINDS } from '@pkg/domain';
import {
  breakdownNoteRolePushRecipients,
  breakdownPushKind,
  breakdownPushMessage,
  type ContractingPushContent,
  type ContractingPushEvent,
  formatJobNumber,
  jobNoteRolePushRecipients,
  notePushMessage,
  SERVICE_DUE_SOON_PUSH_KIND,
  serviceDueNeedsAttention,
  serviceDueSoonPushMessage,
} from '@pkg/domain/contracting';
import type { AppRole, PushKind } from '@pkg/schema';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { deliverPush, type PushDelivery, type PushMessage, type PushSender } from '../../push/push-sender.js';
import { listPushTokensForUsers } from '../../push/push-token-service.js';
import { businessRoleSql } from '../../users/business-role.js';
import { selectBreakdowns, toBreakdownSummary } from '../breakdowns/breakdown-load.js';
import { getMachine } from '../fleet/machine-service.js';

/**
 * Eligible role recipients and thread participants share the same filters: never muted, a shared device,
 * a banned account or the author. Selecting users once also deduplicates people reached both ways.
 */
async function recipientUserIds(
  db: Db,
  kind: PushKind,
  excludeUserId: string | null,
  audience?: { roles: readonly AppRole[]; participants: string[] },
) {
  const { business, roles } = PUSH_KINDS[kind];
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.isDevice, false),
        sql`${user.banned} is not true`,
        inArray(businessRoleSql(business), [...roles]),
        audience
          ? or(inArray(businessRoleSql(business), [...audience.roles]), inArray(user.id, audience.participants))
          : undefined,
        sql`not (${user.mutedPushKinds} @> ${JSON.stringify([kind])}::jsonb)`,
        excludeUserId === null ? undefined : ne(user.id, excludeUserId),
      ),
    );
  return rows.map((row) => row.id);
}

async function addressed(
  db: Db,
  kind: PushKind,
  excludeUserId: string | null,
  content: ContractingPushContent,
  audience?: { roles: readonly AppRole[]; participants: string[] },
): Promise<PushMessage[]> {
  const tokens = await listPushTokensForUsers({
    db,
    userIds: await recipientUserIds(db, kind, excludeUserId, audience),
  });
  return tokens.map(({ token }) => ({ to: token, ...content }));
}

/** The messages one Contracting event turns into, one per token of everyone it should reach. */
export async function buildContractingPush({
  db,
  event,
}: {
  db: Db;
  event: ContractingPushEvent;
}): Promise<PushMessage[]> {
  if (event.kind === 'breakdown-note.added') {
    const [record] = await db
      .select({ note: contractingBreakdownNotes, authorName: user.name })
      .from(contractingBreakdownNotes)
      .innerJoin(user, eq(user.id, contractingBreakdownNotes.authorUserId))
      .where(eq(contractingBreakdownNotes.id, event.noteId));
    if (!record) return [];
    const { note, authorName } = record;
    const [row] = await selectBreakdowns(db).where(eq(contractingBreakdowns.id, note.breakdownId)).limit(1);
    if (!row) return [];
    const breakdown = toBreakdownSummary(row);
    const authors = await db
      .selectDistinct({ id: contractingBreakdownNotes.authorUserId })
      .from(contractingBreakdownNotes)
      .where(eq(contractingBreakdownNotes.breakdownId, note.breakdownId));
    return addressed(
      db,
      'contracting.breakdown-note',
      note.authorUserId,
      notePushMessage({
        kind: 'breakdown',
        id: breakdown.id,
        code: breakdown.subject.code,
        authorName,
        text: note.text,
      }),
      {
        roles: breakdownNoteRolePushRecipients,
        participants: [
          breakdown.reportedByUserId,
          ...(row.jobForemanUserId ? [row.jobForemanUserId] : []),
          ...authors.map(({ id }) => id),
        ],
      },
    );
  }
  if (event.kind === 'job-note.added') {
    const [record] = await db
      .select({ note: contractingJobNotes, authorName: user.name, job: contractingJobs })
      .from(contractingJobNotes)
      .innerJoin(user, eq(user.id, contractingJobNotes.authorUserId))
      .innerJoin(contractingJobs, eq(contractingJobs.id, contractingJobNotes.jobId))
      .where(eq(contractingJobNotes.id, event.noteId));
    if (!record) return [];
    const { note, authorName, job } = record;
    const authors = await db
      .selectDistinct({ id: contractingJobNotes.authorUserId })
      .from(contractingJobNotes)
      .where(eq(contractingJobNotes.jobId, job.id));
    return addressed(
      db,
      'contracting.job-note',
      note.authorUserId,
      notePushMessage({ kind: 'job', id: job.id, code: formatJobNumber(job.code), authorName, text: note.text }),
      {
        roles: jobNoteRolePushRecipients,
        participants: [...(job.foremanUserId ? [job.foremanUserId] : []), ...authors.map(({ id }) => id)],
      },
    );
  }
  if (event.kind === 'breakdown.reported') {
    // Actor-blind on purpose: the push goes out on the server's behalf, not the reporter's.
    const [row] = await selectBreakdowns(db).where(eq(contractingBreakdowns.id, event.breakdownId)).limit(1);
    if (!row) return [];
    const breakdown = toBreakdownSummary(row);
    return addressed(
      db,
      breakdownPushKind(breakdown.urgency),
      breakdown.reportedByUserId,
      breakdownPushMessage({ ...breakdown, subjectCode: breakdown.subject.code }),
    );
  }
  const machine = await getMachine({ db, id: event.machineId });
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
