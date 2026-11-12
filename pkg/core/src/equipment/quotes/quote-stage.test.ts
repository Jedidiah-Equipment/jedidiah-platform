import { type Db, user } from '@pkg/db';
import { customers, jobs, products, productUnits, quotes } from '@pkg/db/equipment';
import { awaitsPricing, type QuoteStageFacts, quoteStageOf } from '@pkg/domain/equipment';
import type { QuoteStage, QuoteStatus } from '@pkg/schema/equipment';
import { eq } from 'drizzle-orm';
import { describe, expect } from 'vitest';

import { createTester } from '../../test/create-tester.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { awaitsPricingCondition, quoteStageExpression } from './quote-read-service.js';

type Quoted = 'custom' | 'partsSale' | 'fromOrder' | 'fromStock';
/** A cancelled Job is no live Job: `cancelled` inserts one that completed before it was cancelled. */
type Job = QuoteStageFacts['liveJob'] | 'cancelled';
type Case = [name: string, quoted: Quoted, status: QuoteStatus, job: Job, sentBack: boolean, stage: QuoteStage];

const cases: Case[] = [
  ['sent back with its Job still open', 'custom', 'accepted', 'open', true, 'awaiting-pricing'],
  ['sent back with no Job', 'fromOrder', 'accepted', 'none', true, 'awaiting-pricing'],
  ['accepted, Job completed', 'custom', 'accepted', 'completed', false, 'awaiting-pricing'],
  ['accepted, Job open', 'custom', 'accepted', 'open', false, 'accepted'],
  ['accepted, only Job cancelled after completing', 'custom', 'accepted', 'cancelled', false, 'accepted'],
  ['accepted Service Work with no Job', 'custom', 'accepted', 'none', false, 'accepted'],
  ['accepted Parts Sale with no Job', 'partsSale', 'accepted', 'none', false, 'awaiting-pricing'],
  ['accepted Parts Sale, Job open', 'partsSale', 'accepted', 'open', false, 'accepted'],
  ['accepted From Stock with no Job', 'fromStock', 'accepted', 'none', false, 'awaiting-pricing'],
  ['accepted From Order with no Job', 'fromOrder', 'accepted', 'none', false, 'accepted'],
  ['accepted From Order, Job completed', 'fromOrder', 'accepted', 'completed', false, 'awaiting-pricing'],
  ['draft Custom Quote, Job completed', 'custom', 'draft', 'completed', false, 'awaiting-pricing'],
  ['sent Custom Quote, Job completed', 'custom', 'sent', 'completed', false, 'awaiting-pricing'],
  ['draft Custom Quote, Job open', 'custom', 'draft', 'open', false, 'draft'],
  ['draft Product Quote, Job completed', 'fromOrder', 'draft', 'completed', false, 'draft'],
  ['awaiting approval, Job completed', 'custom', 'awaiting-approval', 'completed', false, 'awaiting-approval'],
  ['invoiced From Stock', 'fromStock', 'invoiced', 'none', false, 'invoiced'],
  ['rejected Custom Quote', 'custom', 'rejected', 'none', false, 'rejected'],
];

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values({
    createdAt: now,
    email: 'super@example.com',
    emailVerified: true,
    id: 'super-user',
    name: 'Super User',
    role: 'super-admin',
    updatedAt: now,
  });
  const [customer] = await db.insert(customers).values({ companyName: 'Acme Mining', email: null }).returning();
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      modelCode: 'STAGE-001',
      name: 'Stage Product',
      rangeId: await createProductRangeFixture(db),
    })
    .returning();
  if (!customer || !product) throw new Error('Quote Stage test setup did not return required rows');
  return { customerId: customer.id, productId: product.id };
});

describe('awaitsPricing and its SQL twin', () => {
  test('give every case the same Stage', async ({ context }) => {
    for (const [index, [name, quoted, status, job, sentBack, stage]] of cases.entries()) {
      const id = await insertCase(context.db, context, { job, quoted, sentBack, status }, index + 1);
      const facts: QuoteStageFacts = {
        hasProductUnit: quoted === 'fromStock',
        isPartsSale: quoted === 'partsSale',
        kind: quoted === 'custom' || quoted === 'partsSale' ? 'custom' : 'product',
        liveJob: job === 'cancelled' ? 'none' : job,
        sentBack,
        status,
      };
      const [row] = await context.db
        .select({ awaits: awaitsPricingCondition().mapWith(Boolean), stage: quoteStageExpression() })
        .from(quotes)
        .where(eq(quotes.id, id));

      const expected = { name, awaits: stage === 'awaiting-pricing', stage };
      expect({ name, awaits: awaitsPricing(facts), stage: quoteStageOf(facts) }).toEqual(expected);
      expect({ name, ...row }).toEqual(expected);
    }
  });
});

async function insertCase(
  db: Db,
  context: { customerId: string; productId: string },
  item: { quoted: Quoted; status: QuoteStatus; job: Job; sentBack: boolean },
  sequence: number,
) {
  const now = new Date();
  const product = item.quoted === 'fromOrder' || item.quoted === 'fromStock';
  const productUnitId = product ? await insertUnit(db, context.productId, sequence) : null;
  const [quote] = await db
    .insert(quotes)
    .values({
      acceptedAt: ['accepted', 'awaiting-approval', 'invoiced'].includes(item.status) ? now : null,
      cancellationReason: null,
      customerId: context.customerId,
      invoiceNumber: item.status === 'invoiced' ? 'INV-1' : null,
      invoicedAt: item.status === 'invoiced' ? now : null,
      isPartsSale: item.quoted === 'partsSale',
      kind: product ? 'product' : 'custom',
      productId: product ? context.productId : null,
      productUnitId: item.quoted === 'fromStock' ? productUnitId : null,
      quotedBasePrice: product ? 1000 : 0,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'super-user',
      sentBackAt: item.sentBack ? now : null,
      sentBackByUserId: item.sentBack ? 'super-user' : null,
      sentBackNote: item.sentBack ? 'Add the call-out fee' : null,
      status: item.status,
      workTitle: product ? null : 'Pump rebuild',
    })
    .returning({ id: quotes.id });
  if (!quote) throw new Error('Quote insert did not return a row');

  const jobUnitId = product && item.quoted === 'fromOrder' ? productUnitId : null;
  if (item.job !== 'none') {
    await db.insert(jobs).values({
      cancelledAt: item.job === 'cancelled' ? now : null,
      completedOn: item.job === 'open' ? null : '2026-11-01',
      productUnitId: jobUnitId,
      quoteId: quote.id,
    });
  }
  return quote.id;
}

async function insertUnit(db: Db, productId: string, sequence: number) {
  const [unit] = await db
    .insert(productUnits)
    .values({
      productId,
      productSerialNumber: `STAGE-001-26-${sequence}`,
      productSerialPrefix: 'STAGE-001',
      productSerialSequence: sequence,
      productSerialYear: 26,
    })
    .returning({ id: productUnits.id });
  if (!unit) throw new Error('Product unit insert did not return a row');
  return unit.id;
}
