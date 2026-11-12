import { z } from 'zod';

import { actionVerdict, actionVerdicts } from '../../common/action-verdicts.js';
import { InvoiceNumber } from '../../common/invoice-number.js';
import { requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
import { QuoteCode } from '../common/public-code.js';

/** Where a Quote stands on the way to its invoice (see GLOSSARY-EQUIPMENT.md): its status, except that Awaiting pricing is derived. */
export type QuoteStage = z.infer<typeof QuoteStage>;
export const QuoteStage = z.enum([
  'draft',
  'sent',
  'accepted',
  'awaiting-pricing',
  'awaiting-approval',
  'awaiting-invoice',
  'invoiced',
  'rejected',
  'cancelled',
]);

export const invoicingQuoteStages = [
  'awaiting-pricing',
  'awaiting-approval',
  'awaiting-invoice',
  'invoiced',
] as const satisfies readonly QuoteStage[];
export const openInvoicingQuoteStages = [
  'awaiting-pricing',
  'awaiting-approval',
  'awaiting-invoice',
] as const satisfies readonly QuoteStage[];

/** Every move a person can ask of a sold Quote on its way to the invoice. */
export const quoteActionNames = [
  'sendForApproval',
  'approve',
  'sendBack',
  'stampInvoice',
  'correctInvoiceNumber',
  'removeInvoiceNumber',
] as const;
export type QuoteActionName = (typeof quoteActionNames)[number];

export const QuoteActionBlockedReason = z.enum(['no-permission', 'wrong-status', 'delivery-unconfirmed']);
export type QuoteActionBlockedReason = z.infer<typeof QuoteActionBlockedReason>;

export const QuoteActionVerdict = actionVerdict(QuoteActionBlockedReason);
export type QuoteActionVerdict = z.infer<typeof QuoteActionVerdict>;

/** The Quote Actions verdicts for the person asking; permission sits inside them. */
export const QuoteActions = actionVerdicts(quoteActionNames, QuoteActionVerdict);
export type QuoteActions = z.infer<typeof QuoteActions>;

export type QuoteSentBackNote = z.infer<typeof QuoteSentBackNote>;
export const QuoteSentBackNote = requiredTrimmedText('Say what needs to change');

export type QuoteStageActionInput = z.infer<typeof QuoteStageActionInput>;
export const QuoteStageActionInput = z.object({ id: UUID }).strict();

export type QuoteSendBackInput = z.infer<typeof QuoteSendBackInput>;
export const QuoteSendBackInput = z.object({ id: UUID, note: QuoteSentBackNote }).strict();

/** Stamping and correcting take the same input: the Quote and the number as the accounting system printed it. */
export type QuoteStampInvoiceInput = z.infer<typeof QuoteStampInvoiceInput>;
export const QuoteStampInvoiceInput = z.object({ id: UUID, invoiceNumber: InvoiceNumber }).strict();

/** A Quote already carrying an Invoice Number: a hint for the stamp dialog, never a refusal. */
export type QuoteInvoiceNumberMatch = z.infer<typeof QuoteInvoiceNumberMatch>;
export const QuoteInvoiceNumberMatch = z.object({
  id: UUID,
  code: QuoteCode,
  customerCompanyName: z.string(),
});

export type QuoteStageCounts = z.infer<typeof QuoteStageCounts>;
export const QuoteStageCounts = z.object({
  counts: z.record(QuoteStage, z.number().int().nonnegative()),
});
