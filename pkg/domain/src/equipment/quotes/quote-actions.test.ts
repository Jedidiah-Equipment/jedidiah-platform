import type { EquipmentRole } from '@pkg/schema';
import type { QuoteActionName, QuoteStage } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { accessForRole } from '../../testing/index.js';
import { deriveQuoteActions, judgeQuoteAction } from './quote-actions.js';

const actorFor = (role: EquipmentRole) => accessForRole(role, 'user-1');

const allowedIn = (stage: QuoteStage, role: EquipmentRole) =>
  Object.entries(deriveQuoteActions({ deliveryTerms: 'ex_factory', stage }, actorFor(role)))
    .filter(([, verdict]) => verdict.allowed)
    .map(([action]) => action as QuoteActionName);

describe('quote actions', () => {
  it.each([
    ['accepted', ['sendForApproval']],
    ['awaiting-pricing', ['sendForApproval']],
    ['awaiting-approval', ['approve', 'sendBack']],
    ['awaiting-invoice', ['sendBack', 'stampInvoice']],
    ['invoiced', ['correctInvoiceNumber', 'removeInvoiceNumber']],
    ['draft', []],
    ['cancelled', []],
  ] as const)('a Super Administrator may take in %s exactly %j', (stage, actions) => {
    expect(allowedIn(stage, 'super-admin')).toEqual(actions);
  });

  it('an Administrator completes and stamps but never approves, sends back or removes', () => {
    expect(allowedIn('awaiting-pricing', 'admin')).toEqual(['sendForApproval']);
    expect(allowedIn('awaiting-approval', 'admin')).toEqual([]);
    expect(allowedIn('awaiting-invoice', 'admin')).toEqual(['stampInvoice']);
    expect(allowedIn('invoiced', 'admin')).toEqual(['correctInvoiceNumber']);
  });

  it('refuses a send while Delivery Terms are To be confirmed, and says why each refusal happened', () => {
    expect(judgeQuoteAction('sendForApproval', { deliveryTerms: 'tbc', stage: 'accepted' }, actorFor('admin'))).toEqual(
      {
        allowed: false,
        message: 'Confirm delivery before sending this quote for approval.',
        reason: 'delivery-unconfirmed',
      },
    );
    expect(
      judgeQuoteAction('approve', { deliveryTerms: 'included', stage: 'awaiting-approval' }, actorFor('admin')),
    ).toEqual({ allowed: false, message: 'You do not have permission to approve a Quote.', reason: 'no-permission' });
    expect(
      judgeQuoteAction('sendBack', { deliveryTerms: 'included', stage: 'invoiced' }, actorFor('super-admin')),
    ).toEqual({
      allowed: false,
      message: 'You can only send a Quote back while it is Awaiting approval or Awaiting invoice.',
      reason: 'wrong-status',
    });
  });
});
