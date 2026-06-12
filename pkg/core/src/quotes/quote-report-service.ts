import { customers, type Db, quotes } from '@pkg/db';
import {
  addDateOnlyDays,
  computeQuoteTotal,
  JOHANNESBURG_TIME_ZONE,
  parseDateOnlyParts,
  toPlantDateOnly,
  zonedDateStartToUtcInstant,
} from '@pkg/domain';
import {
  type DateOnlyIso,
  QuotePipelineSummary,
  QuoteStatus,
  QuoteStatusSummary,
  QuoteWeeklyFlowSummary,
  StaleSentQuoteList,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { getSelectedAssembliesByQuoteId, type QuoteSelectedAssemblyRow } from './quote-selected-assemblies.js';

const QUOTE_WEEKLY_FLOW_WEEK_COUNT = 12;
const QUOTE_NEWLY_SENT_WINDOW_DAYS = 30;
const QUOTE_DECISION_WINDOW_DAYS = 90;
const STALE_SENT_QUOTE_LIMIT = 8;

export async function summarizeQuotesByStatus({ db }: { db: Db }): Promise<QuoteStatusSummary> {
  const rows = await db
    .select({
      count: sql<number>`count(*)`,
      status: quotes.status,
    })
    .from(quotes)
    .groupBy(quotes.status);
  const countsByStatus = new Map(rows.map((row) => [row.status, Number(row.count)]));

  return QuoteStatusSummary.parse({
    items: QuoteStatus.options.map((status) => ({
      count: countsByStatus.get(status) ?? 0,
      status,
    })),
  });
}

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
  const acceptedWeekStartExpression = sql<string>`to_char(date_trunc('week', ${quotes.statusChangedAt} AT TIME ZONE ${JOHANNESBURG_TIME_ZONE})::date, 'YYYY-MM-DD')`;
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
      .where(
        and(
          eq(quotes.status, 'accepted'),
          gte(quotes.statusChangedAt, range.startInstant),
          lt(quotes.statusChangedAt, range.endInstant),
        ),
      )
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

export async function summarizeQuotePipeline({
  clock = () => new Date(),
  db,
}: {
  clock?: () => Date;
  db: Db;
}): Promise<QuotePipelineSummary> {
  const now = clock();
  const newlySentWindowStart = getPlantWindowStartInstant({ days: QUOTE_NEWLY_SENT_WINDOW_DAYS, now });
  const decisionWindowStart = getPlantWindowStartInstant({ days: QUOTE_DECISION_WINDOW_DAYS, now });

  const [sentRows, decisionRows] = await Promise.all([
    db
      .select({
        deliveryIncluded: quotes.deliveryIncluded,
        deliveryPrice: quotes.deliveryPrice,
        discountPercent: quotes.discountPercent,
        id: quotes.id,
        quotedBasePrice: quotes.quotedBasePrice,
        statusChangedAt: quotes.statusChangedAt,
      })
      .from(quotes)
      .where(eq(quotes.status, 'sent')),
    db
      .select({
        count: sql<number>`count(*)`,
        status: quotes.status,
      })
      .from(quotes)
      .where(and(inArray(quotes.status, ['accepted', 'rejected']), gte(quotes.statusChangedAt, decisionWindowStart)))
      .groupBy(quotes.status),
  ]);
  const selectedAssembliesByQuoteId = await getSelectedAssembliesByQuoteId({
    db,
    quoteIds: sentRows.map((row) => row.id),
  });
  const totalsByQuoteId = new Map(
    sentRows.map((row) => [row.id, computeSentQuoteTotal(row, selectedAssembliesByQuoteId.get(row.id) ?? [])]),
  );
  const decisionCountsByStatus = new Map(decisionRows.map((row) => [row.status, Number(row.count)]));

  return QuotePipelineSummary.parse({
    accepted90dCount: decisionCountsByStatus.get('accepted') ?? 0,
    newlySent30dValue: sumQuoteTotals(
      sentRows.filter((row) => row.statusChangedAt >= newlySentWindowStart),
      totalsByQuoteId,
    ),
    openSentCount: sentRows.length,
    openSentValue: sumQuoteTotals(sentRows, totalsByQuoteId),
    rejected90dCount: decisionCountsByStatus.get('rejected') ?? 0,
  });
}

export async function listStaleSentQuotes({
  clock = () => new Date(),
  db,
  limit = STALE_SENT_QUOTE_LIMIT,
}: {
  clock?: () => Date;
  db: Db;
  limit?: number;
}): Promise<StaleSentQuoteList> {
  const rows = await db
    .select({
      code: quotes.code,
      customerCompanyName: customers.companyName,
      customerThumbnailDataUrl: customers.thumbnailDataUrl,
      deliveryIncluded: quotes.deliveryIncluded,
      deliveryPrice: quotes.deliveryPrice,
      discountPercent: quotes.discountPercent,
      id: quotes.id,
      quotedBasePrice: quotes.quotedBasePrice,
      quotedCurrencyCode: quotes.quotedCurrencyCode,
      statusChangedAt: quotes.statusChangedAt,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .where(eq(quotes.status, 'sent'))
    .orderBy(asc(quotes.statusChangedAt), asc(quotes.id))
    .limit(limit);
  const selectedAssembliesByQuoteId = await getSelectedAssembliesByQuoteId({
    db,
    quoteIds: rows.map((row) => row.id),
  });
  const today = toPlantDateOnly(clock());

  return StaleSentQuoteList.parse({
    items: rows.map((row) => ({
      code: row.code,
      currencyCode: row.quotedCurrencyCode,
      customerCompanyName: row.customerCompanyName,
      customerThumbnailDataUrl: row.customerThumbnailDataUrl,
      id: row.id,
      sentDaysAgo: Math.max(0, diffDateOnlyDays(today, toPlantDateOnly(row.statusChangedAt))),
      statusChangedAt: row.statusChangedAt.toISOString(),
      totalValue: computeSentQuoteTotal(row, selectedAssembliesByQuoteId.get(row.id) ?? []),
    })),
  });
}

function getPlantWeekRange({ now, weekCount }: { now: Date; weekCount: number }) {
  const currentPlantDate = toPlantDateOnly(now);
  const currentWeekStartDate = addDateOnlyDays(
    currentPlantDate,
    -getMondayBasedWeekdayOffset(getDateOnlyWeekday(currentPlantDate)),
  );
  const rangeStartDate = addDateOnlyDays(currentWeekStartDate, -(weekCount - 1) * 7);
  const rangeEndDate = addDateOnlyDays(currentWeekStartDate, 7);
  const weekStartDates = Array.from({ length: weekCount }, (_, index) => addDateOnlyDays(rangeStartDate, index * 7));

  return {
    endInstant: zonedDateStartToUtcInstant(rangeEndDate, JOHANNESBURG_TIME_ZONE),
    startInstant: zonedDateStartToUtcInstant(rangeStartDate, JOHANNESBURG_TIME_ZONE),
    weekStartDates,
  };
}

function getMondayBasedWeekdayOffset(weekday: number): number {
  return (weekday + 6) % 7;
}

function getDateOnlyWeekday(date: DateOnlyIso): number {
  const { day, month, year } = parseDateOnlyParts(date);

  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

// Windows cover exactly `days` plant days including plant today, anchored to Johannesburg day starts.
function getPlantWindowStartInstant({ days, now }: { days: number; now: Date }): Date {
  const windowStartDate = addDateOnlyDays(toPlantDateOnly(now), -(days - 1));

  return zonedDateStartToUtcInstant(windowStartDate, JOHANNESBURG_TIME_ZONE);
}

function computeSentQuoteTotal(
  row: {
    deliveryIncluded: boolean;
    deliveryPrice: number;
    discountPercent: number;
    quotedBasePrice: number;
  },
  selectedAssemblies: readonly QuoteSelectedAssemblyRow[],
): number {
  // Match the Quotes table: stale optional assemblies have a null catalog reference and are excluded.
  const liveSelectedAssemblies = selectedAssemblies.filter((assembly) => assembly.productAssemblyId !== null);

  return computeQuoteTotal({
    deliveryIncluded: row.deliveryIncluded,
    deliveryPrice: row.deliveryPrice,
    discountPercent: row.discountPercent,
    quotedBasePrice: row.quotedBasePrice,
    selectedAssemblyPrices: liveSelectedAssemblies.map((assembly) => assembly.quotedPrice),
  });
}

function sumQuoteTotals(rows: readonly { id: UUID }[], totalsByQuoteId: ReadonlyMap<UUID, number>): number {
  return rows.reduce((total, row) => total + (totalsByQuoteId.get(row.id) ?? 0), 0);
}

function diffDateOnlyDays(later: DateOnlyIso, earlier: DateOnlyIso): number {
  const laterParts = parseDateOnlyParts(later);
  const earlierParts = parseDateOnlyParts(earlier);
  const laterUtc = Date.UTC(laterParts.year, laterParts.month - 1, laterParts.day);
  const earlierUtc = Date.UTC(earlierParts.year, earlierParts.month - 1, earlierParts.day);

  return Math.round((laterUtc - earlierUtc) / 86_400_000);
}
