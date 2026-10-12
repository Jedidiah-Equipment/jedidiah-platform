import { type Db, user } from '@pkg/db';
import { contractingBreakdowns } from '@pkg/db/contracting';
import {
  breakdownPushMessage,
  breakdownPushRecipients,
  type ContractingPushContent,
  type ContractingPushEvent,
  type ContractingPushRole,
  serviceDueSoonPushMessage,
  serviceDueSoonPushRecipients,
} from '@pkg/domain/contracting';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { deliverPush, type PushDelivery, type PushMessage, type PushSender } from '../../push/push-sender.js';
import { listPushTokensForUsers } from '../../push/push-token-service.js';
import { businessRoleSql } from '../../users/business-role.js';
import { selectBreakdowns, toBreakdownSummary } from '../breakdowns/breakdown-load.js';
import { getMachine } from '../fleet/machine-service.js';
import { getContractingSettings } from '../settings/settings-service.js';

/** The people holding a recipient role, never a shared device or a banned account, and never the actor. */
async function recipientUserIds(db: Db, roles: readonly ContractingPushRole[], excludeUserId: string | null) {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.isDevice, false),
        sql`${user.banned} is not true`,
        inArray(businessRoleSql('contracting'), [...roles]),
        excludeUserId === null ? undefined : ne(user.id, excludeUserId),
      ),
    );
  return rows.map((row) => row.id);
}

async function addressed(
  db: Db,
  roles: readonly ContractingPushRole[],
  excludeUserId: string | null,
  content: ContractingPushContent,
): Promise<PushMessage[]> {
  const tokens = await listPushTokensForUsers({ db, userIds: await recipientUserIds(db, roles, excludeUserId) });
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
  if (event.kind === 'breakdown.reported') {
    // Actor-blind on purpose: the push goes out on the server's behalf, not the reporter's.
    const [row] = await selectBreakdowns(db).where(eq(contractingBreakdowns.id, event.breakdownId)).limit(1);
    if (!row) return [];
    const breakdown = toBreakdownSummary(row);
    return addressed(
      db,
      breakdownPushRecipients[breakdown.urgency],
      breakdown.reportedByUserId,
      breakdownPushMessage({ ...breakdown, subjectCode: breakdown.subject.code }),
    );
  }
  const machine = await getMachine({ db, id: event.machineId });
  // Queued work runs after commit: a service closed in between, or a raised threshold, leaves nothing to say.
  const { serviceDueSoonThresholdHours } = await getContractingSettings({ db });
  if (machine.hoursToService === null || machine.hoursToService > serviceDueSoonThresholdHours) return [];
  // Nobody is excluded: the capturer is usually a Foreman, and a workshop manager who captured it still wants it.
  return addressed(
    db,
    serviceDueSoonPushRecipients,
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
