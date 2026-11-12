import type { AppPermission, UserAccessSummary } from '@pkg/schema';
import {
  type QuoteActionBlockedReason,
  type QuoteActionName,
  type QuoteActions,
  type QuoteActionVerdict,
  type QuoteDeliveryTerms,
  type QuoteStage,
  quoteActionNames,
} from '@pkg/schema/equipment';

import { hasPermission } from '../../auth/authorization.js';
import { joinOr } from '../../formatting/text.js';
import { quoteStageLabels } from './quote-stage.js';

/** Who is asking: the session's access summary, built once at the API edge. */
export type QuoteActor = UserAccessSummary;

/** The least of a Quote the verdict needs, so a core row and a QuoteDetail both satisfy it. */
export type QuoteActionSubject = { stage: QuoteStage; deliveryTerms: QuoteDeliveryTerms };

type Rule = {
  /** The Stages the action is open in. */
  stages: readonly QuoteStage[];
  permission: AppPermission;
  /** What the refusal copy calls the action: "You can only <verb> while …". */
  verb: string;
};

const rules: Record<QuoteActionName, Rule> = {
  // Any accepted Quote may be sent, so a sale can be invoiced before its work finishes.
  sendForApproval: {
    stages: ['accepted', 'awaiting-pricing'],
    permission: 'equipment_quote:price',
    verb: 'send a Quote for approval',
  },
  approve: { stages: ['awaiting-approval'], permission: 'equipment_quote:approve', verb: 'approve a Quote' },
  sendBack: {
    stages: ['awaiting-approval', 'awaiting-invoice'],
    permission: 'equipment_quote:approve',
    verb: 'send a Quote back',
  },
  stampInvoice: {
    stages: ['awaiting-invoice'],
    permission: 'equipment_invoice:update',
    verb: 'enter an Invoice Number',
  },
  correctInvoiceNumber: {
    stages: ['invoiced'],
    permission: 'equipment_invoice:update',
    verb: 'correct an Invoice Number',
  },
  removeInvoiceNumber: {
    stages: ['invoiced'],
    permission: 'equipment_quote:approve',
    verb: 'remove an Invoice Number',
  },
};

function refusalMessage(rule: Rule, reason: QuoteActionBlockedReason): string {
  switch (reason) {
    case 'no-permission':
      return `You do not have permission to ${rule.verb}.`;
    case 'wrong-status':
      return `You can only ${rule.verb} while it is ${joinOr(rule.stages.map((stage) => quoteStageLabels[stage]))}.`;
    case 'delivery-unconfirmed':
      return 'Confirm delivery before sending this quote for approval.';
  }
}

/** Whether this actor may take this action on this Quote now, and if not, the first reason why not. */
export function judgeQuoteAction(
  action: QuoteActionName,
  quote: QuoteActionSubject,
  actor: QuoteActor,
): QuoteActionVerdict {
  const rule = rules[action];
  const blocked = (reason: QuoteActionBlockedReason): QuoteActionVerdict => ({
    allowed: false,
    reason,
    message: refusalMessage(rule, reason),
  });
  if (!hasPermission(actor, rule.permission)) return blocked('no-permission');
  if (!rule.stages.includes(quote.stage)) return blocked('wrong-status');
  if (action === 'sendForApproval' && quote.deliveryTerms === 'tbc') return blocked('delivery-unconfirmed');
  return { allowed: true };
}

/** Every Quote Action's verdict for this actor, as the Quote read serves them. */
export function deriveQuoteActions(quote: QuoteActionSubject, actor: QuoteActor): QuoteActions {
  return Object.fromEntries(
    quoteActionNames.map((action) => [action, judgeQuoteAction(action, quote, actor)]),
  ) as QuoteActions;
}
