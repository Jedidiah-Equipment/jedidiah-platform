import { auditEvents, type Db, user } from '@pkg/db';
import { customers, jobs, quotes } from '@pkg/db/equipment';
import type { EquipmentRole } from '@pkg/schema';
import { formatQuoteCode, type QuoteActionName, type QuoteStatus } from '@pkg/schema/equipment';
import { and, eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../../test/create-tester.js';
import { testQuoteActor } from '../test/quote-actor.js';
import { getQuote } from './quote-read-service.js';
import { cancelQuote } from './quote-service.js';
import {
  approveQuote,
  correctQuoteInvoiceNumber,
  findQuotesByInvoiceNumber,
  removeQuoteInvoiceNumber,
  sendQuoteBack,
  sendQuoteForApproval,
  stampQuoteInvoice,
  summarizeQuoteStages,
} from './quote-stage-service.js';

const roles = {
  admin: 'admin-user',
  'procurement-manager': 'procurement-user',
  sales: 'sales-user',
  'super-admin': 'super-user',
} as const satisfies Partial<Record<EquipmentRole, string>>;
type Role = keyof typeof roles;

const as = (role: Role) => testQuoteActor(roles[role], role);

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values(
    (Object.entries(roles) as [Role, string][]).map(([role, id]) => ({
      createdAt: now,
      email: `${id}@example.com`,
      emailVerified: true,
      id,
      name: `${role === 'super-admin' ? 'Jed' : 'Dewald'} ${role}`,
      role,
      updatedAt: now,
    })),
  );
  const [customer] = await db.insert(customers).values({ companyName: 'Acme Mining', email: null }).returning();
  if (!customer) throw new Error('Quote Stage test setup did not return a customer');
  return { customerId: customer.id };
});

type Fixture = { customerId: string };

async function insertQuote(
  db: Db,
  { customerId }: Fixture,
  values: { status: QuoteStatus; job?: 'open' | 'completed'; deliveryTerms?: 'tbc'; invoiceNumber?: string } = {
    status: 'accepted',
  },
) {
  const now = new Date();
  const sold = ['accepted', 'awaiting-approval', 'awaiting-invoice', 'invoiced'].includes(values.status);
  const invoiced = values.status === 'invoiced';
  const [quote] = await db
    .insert(quotes)
    .values({
      acceptedAt: sold ? now : null,
      customerId,
      deliveryTerms: values.deliveryTerms,
      invoiceNumber: invoiced ? (values.invoiceNumber ?? 'INV-100') : null,
      invoicedAt: invoiced ? now : null,
      kind: 'custom',
      quotedBasePrice: 0,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: roles.sales,
      status: values.status,
      workTitle: 'Pump rebuild',
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');
  if (values.job) {
    await db.insert(jobs).values({ completedOn: values.job === 'completed' ? '2026-11-01' : null, quoteId: quote.id });
  }
  return quote;
}

const read = (db: Db, id: string) => getQuote({ actor: as('super-admin'), db, id });

type Run = (db: Db, role: Role, id: string) => Promise<void>;

const actions: Record<QuoteActionName, { run: Run; from: QuoteStatus; permitted: Role[] }> = {
  sendForApproval: {
    from: 'accepted',
    permitted: ['admin', 'super-admin'],
    run: (db, role, id) => sendQuoteForApproval({ actor: as(role), db, input: { id } }),
  },
  approve: {
    from: 'awaiting-approval',
    permitted: ['super-admin'],
    run: (db, role, id) => approveQuote({ actor: as(role), db, input: { id } }),
  },
  sendBack: {
    from: 'awaiting-invoice',
    permitted: ['super-admin'],
    run: (db, role, id) => sendQuoteBack({ actor: as(role), db, input: { id, note: 'Add the call-out fee' } }),
  },
  stampInvoice: {
    from: 'awaiting-invoice',
    permitted: ['admin', 'super-admin'],
    run: (db, role, id) => stampQuoteInvoice({ actor: as(role), db, input: { id, invoiceNumber: 'INV-200' } }),
  },
  correctInvoiceNumber: {
    from: 'invoiced',
    permitted: ['admin', 'super-admin'],
    run: (db, role, id) => correctQuoteInvoiceNumber({ actor: as(role), db, input: { id, invoiceNumber: 'INV-201' } }),
  },
  removeInvoiceNumber: {
    from: 'invoiced',
    permitted: ['super-admin'],
    run: (db, role, id) => removeQuoteInvoiceNumber({ actor: as(role), db, input: { id } }),
  },
};

const statuses: QuoteStatus[] = [
  'draft',
  'sent',
  'accepted',
  'awaiting-approval',
  'awaiting-invoice',
  'invoiced',
  'rejected',
  'cancelled',
];
const openIn: Record<QuoteActionName, QuoteStatus[]> = {
  sendForApproval: ['accepted'],
  approve: ['awaiting-approval'],
  sendBack: ['awaiting-approval', 'awaiting-invoice'],
  stampInvoice: ['awaiting-invoice'],
  correctInvoiceNumber: ['invoiced'],
  removeInvoiceNumber: ['invoiced'],
};

describe.each(Object.entries(actions) as [QuoteActionName, (typeof actions)[QuoteActionName]][])(
  '%s',
  (action, { from, permitted, run }) => {
    test('refuses every Stage it has no edge from', async ({ context }) => {
      for (const status of statuses.filter((candidate) => !openIn[action].includes(candidate))) {
        const quote = await insertQuote(context.db, context, {
          status: status === 'cancelled' ? 'rejected' : status,
        });
        if (status === 'cancelled') {
          await context.db
            .update(quotes)
            .set({ cancellationReason: 'Lost', status: 'cancelled' })
            .where(eq(quotes.id, quote.id));
        }
        await expect(run(context.db, 'super-admin', quote.id), status).rejects.toMatchObject({
          code: 'quote.wrong_stage',
        });
      }
    });

    test('refuses every role without its permission', async ({ context }) => {
      const quote = await insertQuote(context.db, context, { status: from });
      for (const role of (Object.keys(roles) as Role[]).filter((candidate) => !permitted.includes(candidate))) {
        await expect(run(context.db, role, quote.id), role).rejects.toMatchObject({ code: 'quote.forbidden' });
      }
      await expect(read(context.db, quote.id)).resolves.toMatchObject({ status: from });
    });

    test('moves the Quote and audits the move', async ({ context }) => {
      for (const role of permitted) {
        const quote = await insertQuote(context.db, context, { status: from });
        await run(context.db, role, quote.id);
        const events = await context.db
          .select()
          .from(auditEvents)
          .where(and(eq(auditEvents.entityType, 'quote'), eq(auditEvents.entityId, quote.id)));
        expect(events).toEqual([expect.objectContaining({ actorUserId: roles[role], action: 'updated' })]);
      }
    });
  },
);

describe('the Quote Stage chain', () => {
  test('carries a sale from Awaiting pricing to Invoiced and names who invoiced it', async ({ context }) => {
    const quote = await insertQuote(context.db, context, { job: 'completed', status: 'accepted' });
    await expect(read(context.db, quote.id)).resolves.toMatchObject({ stage: 'awaiting-pricing' });

    await sendQuoteForApproval({ actor: as('admin'), db: context.db, input: { id: quote.id } });
    await expect(read(context.db, quote.id)).resolves.toMatchObject({ stage: 'awaiting-approval' });

    await approveQuote({ actor: as('super-admin'), db: context.db, input: { id: quote.id } });
    await expect(read(context.db, quote.id)).resolves.toMatchObject({ stage: 'awaiting-invoice' });

    await stampQuoteInvoice({ actor: as('admin'), db: context.db, input: { id: quote.id, invoiceNumber: 'INV-7' } });
    await expect(read(context.db, quote.id)).resolves.toMatchObject({
      invoiceNumber: 'INV-7',
      invoicedAt: expect.any(String),
      invoicedByName: 'Dewald admin',
      stage: 'invoiced',
      status: 'invoiced',
    });

    await correctQuoteInvoiceNumber({
      actor: as('admin'),
      db: context.db,
      input: { id: quote.id, invoiceNumber: 'INV-8' },
    });
    await expect(read(context.db, quote.id)).resolves.toMatchObject({ invoiceNumber: 'INV-8', stage: 'invoiced' });

    await removeQuoteInvoiceNumber({ actor: as('super-admin'), db: context.db, input: { id: quote.id } });
    await expect(read(context.db, quote.id)).resolves.toMatchObject({
      invoiceNumber: null,
      invoicedAt: null,
      invoicedByName: null,
      stage: 'awaiting-invoice',
    });
  });

  test('sending a draft Custom Quote with a completed Job for approval accepts it', async ({ context }) => {
    const quote = await insertQuote(context.db, context, { job: 'completed', status: 'draft' });
    await expect(read(context.db, quote.id)).resolves.toMatchObject({ acceptedAt: null, stage: 'awaiting-pricing' });

    await sendQuoteForApproval({ actor: as('admin'), db: context.db, input: { id: quote.id } });

    await expect(read(context.db, quote.id)).resolves.toMatchObject({
      acceptedAt: expect.any(String),
      stage: 'awaiting-approval',
      status: 'awaiting-approval',
    });
  });

  test('a Quote sent back is Awaiting pricing with the note, even while its Job is open', async ({ context }) => {
    const quote = await insertQuote(context.db, context, { job: 'open', status: 'accepted' });
    await sendQuoteForApproval({ actor: as('admin'), db: context.db, input: { id: quote.id } });
    await sendQuoteBack({
      actor: as('super-admin'),
      db: context.db,
      input: { id: quote.id, note: '  Add the call-out fee  ' },
    });

    await expect(read(context.db, quote.id)).resolves.toMatchObject({
      sentBackAt: expect.any(String),
      sentBackByName: 'Jed super-admin',
      sentBackNote: 'Add the call-out fee',
      stage: 'awaiting-pricing',
      status: 'accepted',
    });

    await sendQuoteForApproval({ actor: as('admin'), db: context.db, input: { id: quote.id } });
    await expect(read(context.db, quote.id)).resolves.toMatchObject({
      sentBackAt: null,
      sentBackByName: null,
      sentBackNote: null,
      stage: 'awaiting-approval',
    });
  });

  test('refuses to send a Quote for approval while its delivery is To be confirmed', async ({ context }) => {
    const quote = await insertQuote(context.db, context, { deliveryTerms: 'tbc', status: 'accepted' });

    await expect(
      sendQuoteForApproval({ actor: as('admin'), db: context.db, input: { id: quote.id } }),
    ).rejects.toMatchObject({ code: 'quote.delivery_unconfirmed' });
  });

  test('cancels an Invoiced Quote only after its Invoice Number is removed', async ({ context }) => {
    const quote = await insertQuote(context.db, context, { status: 'invoiced' });
    const cancel = () =>
      cancelQuote({
        actorUserId: roles['super-admin'],
        cancellationReason: 'Customer withdrew',
        db: context.db,
        id: quote.id,
        mayCancelLockedQuote: true,
      });

    await expect(cancel()).rejects.toMatchObject({ code: 'quote.invoiced' });
    await removeQuoteInvoiceNumber({ actor: as('super-admin'), db: context.db, input: { id: quote.id } });
    await cancel();

    await expect(read(context.db, quote.id)).resolves.toMatchObject({ stage: 'cancelled' });
  });

  test('stamps a number another Quote already carries and finds both by it', async ({ context }) => {
    const first = await insertQuote(context.db, context, { invoiceNumber: 'INV-55', status: 'invoiced' });
    const second = await insertQuote(context.db, context, { status: 'awaiting-invoice' });

    await stampQuoteInvoice({
      actor: as('admin'),
      db: context.db,
      input: { id: second.id, invoiceNumber: 'INV-55' },
    });

    await expect(findQuotesByInvoiceNumber({ db: context.db, invoiceNumber: 'inv-55' })).resolves.toEqual([
      { code: formatQuoteCode(first.code), customerCompanyName: 'Acme Mining', id: first.id },
      { code: formatQuoteCode(second.code), customerCompanyName: 'Acme Mining', id: second.id },
    ]);
  });

  test('counts Quotes in every Stage, Cancelled included', async ({ context }) => {
    await insertQuote(context.db, context, { job: 'completed', status: 'accepted' });
    await insertQuote(context.db, context, { status: 'accepted' });
    await insertQuote(context.db, context, { status: 'invoiced' });
    await insertQuote(context.db, context, { status: 'invoiced', invoiceNumber: 'INV-101' });

    await expect(summarizeQuoteStages({ db: context.db })).resolves.toEqual({
      counts: {
        accepted: 1,
        'awaiting-approval': 0,
        'awaiting-invoice': 0,
        'awaiting-pricing': 1,
        cancelled: 0,
        draft: 0,
        invoiced: 2,
        rejected: 0,
        sent: 0,
      },
    });
  });
});
