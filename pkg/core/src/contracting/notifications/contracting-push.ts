import { type Db, user } from '@pkg/db';
import { contractingBreakdowns, contractingHourReadings, contractingMachines } from '@pkg/db/contracting';
import {
  breakdownPushMessage,
  breakdownPushRecipients,
  type ContractingPushContent,
  type ContractingPushEvent,
  type ContractingPushRecipients,
  hoursToService,
  serviceDueSoonPushMessage,
  serviceDueSoonPushRecipients,
} from '@pkg/domain/contracting';
import { and, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { deliverPush, type PushDelivery, type PushMessage, type PushSender } from '../../push/push-sender.js';
import { listPushTokensForUsers } from '../../push/push-token-service.js';
import { selectBreakdowns, toBreakdownSummary } from '../breakdowns/breakdown-load.js';

/** The people holding a recipient role, never a shared device or a banned account, and never the actor. */
async function recipientUserIds(db: Db, recipients: ContractingPushRecipients, excludeUserId: string | null) {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(
      and(
        eq(user.isDevice, false),
        sql`${user.banned} is not true`,
        excludeUserId === null ? undefined : ne(user.id, excludeUserId),
        or(
          recipients.contractingRoles.length > 0
            ? inArray(user.contractingRole, [...recipients.contractingRoles])
            : undefined,
          recipients.superAdmin ? eq(user.role, 'super-admin') : undefined,
        ),
      ),
    );
  return rows.map((row) => row.id);
}

async function addressed(
  db: Db,
  recipients: ContractingPushRecipients,
  excludeUserId: string | null,
  content: ContractingPushContent,
): Promise<PushMessage[]> {
  const tokens = await listPushTokensForUsers({ db, userIds: await recipientUserIds(db, recipients, excludeUserId) });
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
  const [machine] = await db
    .select({
      id: contractingMachines.id,
      code: contractingMachines.code,
      nextServiceDueHours: contractingMachines.nextServiceDueHours,
    })
    .from(contractingMachines)
    .where(eq(contractingMachines.id, event.machineId));
  if (!machine) return [];
  const [latest] = await db
    .select({ value: contractingHourReadings.value })
    .from(contractingHourReadings)
    .where(eq(contractingHourReadings.machineId, machine.id))
    .orderBy(desc(contractingHourReadings.sequence))
    .limit(1);
  const remaining = hoursToService({
    latestReadingHours: latest?.value ?? null,
    nextServiceDueHours: machine.nextServiceDueHours,
  });
  if (remaining === null) return [];
  // Nobody is excluded: the capturer is usually a Foreman, and a workshop manager who captured it still wants it.
  return addressed(
    db,
    serviceDueSoonPushRecipients,
    null,
    serviceDueSoonPushMessage({ id: machine.id, code: machine.code, hoursToService: remaining }),
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
