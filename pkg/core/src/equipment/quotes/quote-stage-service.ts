import type { DatabaseTransaction, Db } from '@pkg/db';
import { customers, quotes } from '@pkg/db/equipment';
import { judgeQuoteAction, type QuoteActor, quoteTransitions } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import {
  formatQuoteCode,
  type QuoteActionBlockedReason,
  type QuoteActionName,
  QuoteInvoiceNumberMatch,
  type QuoteSendBackInput,
  QuoteStage,
  type QuoteStageActionInput,
  type QuoteStageCounts,
  type QuoteStampInvoiceInput,
} from '@pkg/schema/equipment';
import { asc, eq, sql } from 'drizzle-orm';

import { diffAuditUpdate, recordAuditUpdate } from '../../audit/audit-writer.js';
import { quoteAuditDescriptor } from './quote-audit.js';
import { QuoteError, type QuoteErrorCode, quoteNotFound } from './quote-errors.js';
import { quoteRowStage } from './quote-mappers.js';
import { quoteStageExpression, readLiveJob } from './quote-read-service.js';
import { listQuoteSelectedAssemblies } from './quote-selected-assemblies.js';
import { listQuoteWorkItems } from './quote-work-items.js';

type QuoteRow = typeof quotes.$inferSelect;
type ActionArgs<Input> = { db: Db; actor: QuoteActor; input: Input };

const refusalCodes = {
  'no-permission': 'quote.forbidden',
  'wrong-status': 'quote.wrong_stage',
  'delivery-unconfirmed': 'quote.delivery_unconfirmed',
} as const satisfies Record<QuoteActionBlockedReason, QuoteErrorCode>;

/** Locks the Quote and asserts the Quote Action against its Stage, refusing with the verdict's own sentence. */
async function lockQuoteFor(
  tx: DatabaseTransaction,
  id: UUID,
  action: QuoteActionName,
  actor: QuoteActor,
): Promise<QuoteRow> {
  const [row] = await tx.select().from(quotes).where(eq(quotes.id, id)).for('update');
  if (!row) throw quoteNotFound(id);
  const stage = quoteRowStage(row, await readLiveJob({ db: tx, quoteId: id }));
  const verdict = judgeQuoteAction(action, { deliveryTerms: row.deliveryTerms, stage }, actor);
  if (!verdict.allowed) throw new QuoteError(refusalCodes[verdict.reason], verdict.message);
  return row;
}

const summaries = {
  sendForApproval: (code) => `Sent ${code} for approval`,
  approve: (code) => `Approved ${code}`,
  sendBack: (code) => `Sent ${code} back`,
  stampInvoice: (code) => `Invoiced ${code}`,
  correctInvoiceNumber: (code) => `Corrected the Invoice Number on ${code}`,
  removeInvoiceNumber: (code) => `Removed the Invoice Number from ${code}`,
} as const satisfies Record<QuoteActionName, (code: string) => string>;

/**
 * Applies one Quote Action's move under the row lock and audits it as one Quote update. Hand-rolled rather than
 * `mutateEntity` because the Quote's audit record carries its collections beside the row.
 */
async function moveQuote(
  db: Db,
  input: { id: UUID },
  action: QuoteActionName,
  actor: QuoteActor,
  columns: (row: QuoteRow, at: Date) => Partial<QuoteRow>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await lockQuoteFor(tx, input.id, action, actor);
    const [selectedAssemblies, workItems] = await Promise.all([
      listQuoteSelectedAssemblies({ quoteId: before.id, tx }),
      listQuoteWorkItems({ quoteId: before.id, tx }),
    ]);
    const [row] = await tx.update(quotes).set(columns(before, new Date())).where(eq(quotes.id, before.id)).returning();
    if (!row) throw quoteNotFound(input.id);
    const changes = diffAuditUpdate(
      quoteAuditDescriptor,
      { row: before, selectedAssemblies, workItems },
      { row, selectedAssemblies, workItems },
    );
    if (changes) {
      await recordAuditUpdate({
        actorUserId: actor.userId,
        after: { row, selectedAssemblies, workItems },
        changes,
        db: tx,
        descriptor: quoteAuditDescriptor,
        summary: summaries[action](formatQuoteCode(row.code)),
      });
    }
  });
}

export const sendQuoteForApproval = ({ db, actor, input }: ActionArgs<QuoteStageActionInput>) =>
  moveQuote(db, input, 'sendForApproval', actor, (row, at) => quoteTransitions.sendForApproval(row, { at }));

export const approveQuote = ({ db, actor, input }: ActionArgs<QuoteStageActionInput>) =>
  moveQuote(db, input, 'approve', actor, (row, at) => quoteTransitions.approve(row, { at }));

export const sendQuoteBack = ({ db, actor, input }: ActionArgs<QuoteSendBackInput>) =>
  moveQuote(db, input, 'sendBack', actor, (row, at) =>
    quoteTransitions.sendBack(row, { at, byUserId: actor.userId, note: input.note }),
  );

export const stampQuoteInvoice = ({ db, actor, input }: ActionArgs<QuoteStampInvoiceInput>) =>
  moveQuote(db, input, 'stampInvoice', actor, (row, at) =>
    quoteTransitions.stampInvoice(row, { at, byUserId: actor.userId, invoiceNumber: input.invoiceNumber }),
  );

export const correctQuoteInvoiceNumber = ({ db, actor, input }: ActionArgs<QuoteStampInvoiceInput>) =>
  moveQuote(db, input, 'correctInvoiceNumber', actor, (row, at) =>
    quoteTransitions.correctInvoiceNumber(row, { at, invoiceNumber: input.invoiceNumber }),
  );

export const removeQuoteInvoiceNumber = ({ db, actor, input }: ActionArgs<QuoteStageActionInput>) =>
  moveQuote(db, input, 'removeInvoiceNumber', actor, (row, at) => quoteTransitions.removeInvoiceNumber(row, { at }));

/** Quotes already carrying this number — a hint for the stamp dialog, never a rule. */
export async function findQuotesByInvoiceNumber({
  db,
  invoiceNumber,
}: {
  db: Db;
  invoiceNumber: string;
}): Promise<QuoteInvoiceNumberMatch[]> {
  const rows = await db
    .select({ id: quotes.id, code: quotes.code, customerCompanyName: customers.companyName })
    .from(quotes)
    .innerJoin(customers, eq(customers.id, quotes.customerId))
    .where(sql`lower(${quotes.invoiceNumber}) = lower(${invoiceNumber})`)
    .orderBy(asc(quotes.code));
  return rows.map((row) => QuoteInvoiceNumberMatch.parse(row));
}

/** How many Quotes stand in each Quote Stage, Cancelled included. */
export async function summarizeQuoteStages({ db }: { db: Db }): Promise<QuoteStageCounts> {
  const stage = quoteStageExpression();
  const rows = await db
    .select({ stage, count: sql<number>`count(*)::integer` })
    .from(quotes)
    // By position: the Stage expression carries bound parameters, which Postgres would not match as the same.
    .groupBy(sql`1`);
  const counts = Object.fromEntries(QuoteStage.options.map((name) => [name, 0])) as QuoteStageCounts['counts'];
  for (const row of rows) counts[row.stage] = row.count;
  return { counts };
}
