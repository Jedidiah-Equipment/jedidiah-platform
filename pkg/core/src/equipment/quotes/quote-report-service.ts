import type { Db } from '@pkg/db';
import { customers, products, quotes } from '@pkg/db/equipment';
import {
  addDateOnlyDays,
  addDateOnlyMonths,
  getPlantDateNow,
  JOHANNESBURG_TIME_ZONE,
  roundToCents,
  startOfDateOnlyMonth,
  startOfDateOnlyWeek,
  toPlantDateOnly,
  zonedDateStartToUtcInstant,
} from '@pkg/domain';
import { type DateOnlyIso, INVOICED_MONTHS_SHOWN } from '@pkg/schema';
import { QuoteInvoicedByMonth, QuoteWeeklyFlowSummary, StaleSentQuoteList } from '@pkg/schema/equipment';
import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';

import { mapQuoteLinkedJob } from './quote-mappers.js';
import { loadQuoteAssociations } from './quote-read-service.js';
import { priceReportQuote } from './quote-report-pricing.js';

// Aggregate Quote reads for the dashboard: counts, sums, and week buckets that project to their own
// summary shapes. QuoteSummary-shaped list reads (including upcoming deliveries) stay in
// quote-service alongside the shared mapQuoteSummary / getJobByQuoteId machinery they reuse.

const QUOTE_WEEKLY_FLOW_WEEK_COUNT = 12;
const STALE_SENT_QUOTE_LIMIT = 8;

export async function summarizeQuoteWeeklyFlow({
  clock = () => new Date(),
  db,
  weekCount = QUOTE_WEEKLY_FLOW_WEEK_COUNT,
}: {
  clock?: () => Date;
  db: Db;
  weekCount?: number;
}): Promise<QuoteWeeklyFlowSummary> {
  const range = getPlantWeekRange({ now: clock(), weekCount });
  // Keep the bucket calendar server-side: Johannesburg weeks are part of the reporting contract.
  const createdWeekStartExpression = sql<string>`to_char(date_trunc('week', ${quotes.createdAt} AT TIME ZONE ${JOHANNESBURG_TIME_ZONE})::date, 'YYYY-MM-DD')`;
  const acceptedWeekStartExpression = sql<string>`to_char(date_trunc('week', ${quotes.acceptedAt} AT TIME ZONE ${JOHANNESBURG_TIME_ZONE})::date, 'YYYY-MM-DD')`;
  const [createdRows, acceptedRows] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)`,
        weekStartDate: createdWeekStartExpression,
      })
      .from(quotes)
      .where(and(gte(quotes.createdAt, range.startInstant), lt(quotes.createdAt, range.endInstant)))
      // Drizzle may qualify the same expression differently between SELECT and GROUP BY; group by ordinal.
      .groupBy(sql`2`),
    db
      .select({
        count: sql<number>`count(*)`,
        weekStartDate: acceptedWeekStartExpression,
      })
      .from(quotes)
      // `accepted_at` is set exactly while a Quote is sold, so the window alone selects sold Quotes.
      .where(and(gte(quotes.acceptedAt, range.startInstant), lt(quotes.acceptedAt, range.endInstant)))
      .groupBy(sql`2`),
  ]);
  const createdCountsByWeekStart = new Map(createdRows.map((row) => [row.weekStartDate, Number(row.count)]));
  const acceptedCountsByWeekStart = new Map(acceptedRows.map((row) => [row.weekStartDate, Number(row.count)]));

  return QuoteWeeklyFlowSummary.parse({
    items: range.weekStartDates.map((weekStartDate) => ({
      acceptedCount: acceptedCountsByWeekStart.get(weekStartDate) ?? 0,
      createdCount: createdCountsByWeekStart.get(weekStartDate) ?? 0,
      weekStartDate,
    })),
  });
}

/**
 * The Quote totals ex VAT, after discount, of the Quotes stamped Invoiced in each plant-time month: this month to date
 * first, then the three full months before it. A Quote whose number was removed has no `invoiced_at` and drops out.
 */
export async function summarizeInvoicedByMonth({
  db,
  today = getPlantDateNow(),
}: {
  db: Db;
  today?: DateOnlyIso;
}): Promise<QuoteInvoicedByMonth> {
  const thisMonth = startOfDateOnlyMonth(today);
  const months = Array.from({ length: INVOICED_MONTHS_SHOWN }, (_, back) => addDateOnlyMonths(thisMonth, -back));
  const from = zonedDateStartToUtcInstant(
    addDateOnlyMonths(thisMonth, 1 - INVOICED_MONTHS_SHOWN),
    JOHANNESBURG_TIME_ZONE,
  );
  const rows = await db
    .select({
      deliveryPrice: quotes.deliveryPrice,
      deliveryTerms: quotes.deliveryTerms,
      discountPercent: quotes.discountPercent,
      id: quotes.id,
      kind: quotes.kind,
      month: sql<DateOnlyIso>`to_char(${quotes.invoicedAt} at time zone ${JOHANNESBURG_TIME_ZONE}, 'YYYY-MM-01')`,
      quotedBasePrice: quotes.quotedBasePrice,
    })
    .from(quotes)
    .where(and(eq(quotes.status, 'invoiced'), gte(quotes.invoicedAt, from)));
  const { selectedAssembliesByQuoteId, workItemsByQuoteId } = await loadQuoteAssociations({
    db,
    quoteIds: rows.map((row) => row.id),
  });
  const byMonth = new Map(months.map((month) => [month, { month, total: 0, quotes: 0 }]));
  for (const row of rows) {
    const bucket = byMonth.get(row.month);
    if (!bucket) continue;
    bucket.total = roundToCents(
      bucket.total +
        priceReportQuote({
          row,
          selectedAssemblies: selectedAssembliesByQuoteId.get(row.id) ?? [],
          workItems: workItemsByQuoteId.get(row.id) ?? [],
        }).subtotal,
    );
    bucket.quotes += 1;
  }
  return QuoteInvoicedByMonth.parse({ months: [...byMonth.values()] });
}

export async function listStaleSentQuotes({
  db,
  limit = STALE_SENT_QUOTE_LIMIT,
}: {
  db: Db;
  limit?: number;
}): Promise<StaleSentQuoteList> {
  const rows = await db
    .select({
      code: quotes.code,
      customerCompanyName: customers.companyName,
      customerThumbnailDataUrl: customers.thumbnailDataUrl,
      deliveryPrice: quotes.deliveryPrice,
      deliveryTerms: quotes.deliveryTerms,
      discountPercent: quotes.discountPercent,
      id: quotes.id,
      kind: quotes.kind,
      productBuildTimeDays: products.buildTimeDays,
      productCurrencyCode: products.currencyCode,
      productModelCode: products.modelCode,
      productName: products.name,
      productThumbnailDataUrl: products.thumbnailDataUrl,
      quotedBasePrice: quotes.quotedBasePrice,
      quotedCurrencyCode: quotes.quotedCurrencyCode,
      statusChangedAt: quotes.statusChangedAt,
      workTitle: quotes.workTitle,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(products, eq(quotes.productId, products.id))
    .where(eq(quotes.status, 'sent'))
    .orderBy(asc(quotes.statusChangedAt), asc(quotes.id))
    .limit(limit);
  const { jobByQuoteId, selectedAssembliesByQuoteId, workItemsByQuoteId } = await loadQuoteAssociations({
    db,
    includeJobs: true,
    quoteIds: rows.map((row) => row.id),
  });
  return StaleSentQuoteList.parse({
    items: rows.map((row) => {
      const job = jobByQuoteId.get(row.id);
      const shared = {
        code: row.code,
        currencyCode: row.quotedCurrencyCode,
        customerCompanyName: row.customerCompanyName,
        customerThumbnailDataUrl: row.customerThumbnailDataUrl,
        id: row.id,
        job: job ? mapQuoteLinkedJob(job) : null,
        statusChangedAt: row.statusChangedAt.toISOString(),
        totalValue: priceReportQuote({
          row,
          selectedAssemblies: selectedAssembliesByQuoteId.get(row.id) ?? [],
          workItems: workItemsByQuoteId.get(row.id) ?? [],
        }).total,
      };

      return row.kind === 'product'
        ? {
            ...shared,
            kind: row.kind,
            product: {
              buildTimeDays: row.productBuildTimeDays,
              currencyCode: row.productCurrencyCode,
              modelCode: row.productModelCode,
              name: row.productName,
              thumbnailDataUrl: row.productThumbnailDataUrl,
            },
            workTitle: null,
          }
        : {
            ...shared,
            kind: row.kind,
            product: null,
            workTitle: row.workTitle,
          };
    }),
  });
}

function getPlantWeekRange({ now, weekCount }: { now: Date; weekCount: number }) {
  const currentWeekStartDate = startOfDateOnlyWeek(toPlantDateOnly(now));
  const rangeStartDate = addDateOnlyDays(currentWeekStartDate, -(weekCount - 1) * 7);
  const rangeEndDate = addDateOnlyDays(currentWeekStartDate, 7);
  const weekStartDates = Array.from({ length: weekCount }, (_, index) => addDateOnlyDays(rangeStartDate, index * 7));

  return {
    endInstant: zonedDateStartToUtcInstant(rangeEndDate, JOHANNESBURG_TIME_ZONE),
    startInstant: zonedDateStartToUtcInstant(rangeStartDate, JOHANNESBURG_TIME_ZONE),
    weekStartDates,
  };
}
