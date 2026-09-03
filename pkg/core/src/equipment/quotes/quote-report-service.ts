import { customers, type Db, jobs, products, quotes } from '@pkg/db';
import {
  addDateOnlyDays,
  diffDateOnlyDays,
  foldJobScheduleStates,
  JOHANNESBURG_TIME_ZONE,
  startOfDateOnlyWeek,
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
import { and, asc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';

import { findBoardBayRows, toProjectedBoard } from '../jobs/board-read.js';
import { listWorkingCalendarOffDays } from '../jobs/working-calendar-service.js';
import { mapQuoteLinkedJob } from './quote-mappers.js';
import { loadQuoteAssociations } from './quote-read-service.js';
import { priceReportQuote, type ReportQuotePricingRow } from './quote-report-pricing.js';

// Aggregate Quote reads for the dashboard: counts, sums, and week buckets that project to their own
// summary shapes. QuoteSummary-shaped list reads (including upcoming deliveries) stay in
// quote-service alongside the shared mapQuoteSummary / getJobByQuoteId machinery they reuse.

const QUOTE_WEEKLY_FLOW_WEEK_COUNT = 12;
const QUOTE_NEWLY_SENT_WINDOW_DAYS = 30;
const QUOTE_DECISION_WINDOW_DAYS = 90;
const STALE_SENT_QUOTE_LIMIT = 8;

type ReportQuoteRow = ReportQuotePricingRow & { id: UUID };

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

  const [sentRows, decisionRows, unfinishedJobQuoteRows] = await Promise.all([
    db
      .select({
        deliveryIncluded: quotes.deliveryIncluded,
        deliveryPrice: quotes.deliveryPrice,
        discountPercent: quotes.discountPercent,
        id: quotes.id,
        kind: quotes.kind,
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
    listUnfinishedJobQuoteRows({ db, today: toPlantDateOnly(now) }),
  ]);
  // A sent Custom Quote can already carry a Job, so the Quote behind one is only ever counted once.
  const sentQuoteIds = new Set(sentRows.map((row) => row.id));
  const openJobRows = unfinishedJobQuoteRows.filter((row) => !sentQuoteIds.has(row.id));
  const openRows: readonly ReportQuoteRow[] = [...sentRows, ...openJobRows];
  const { selectedAssembliesByQuoteId, workItemsByQuoteId } = await loadQuoteAssociations({
    db,
    quoteIds: openRows.map((row) => row.id),
  });
  const totalsByQuoteId = new Map(
    openRows.map((row) => [
      row.id,
      priceReportQuote({
        row,
        selectedAssemblies: selectedAssembliesByQuoteId.get(row.id) ?? [],
        workItems: workItemsByQuoteId.get(row.id) ?? [],
      }).subtotal,
    ]),
  );
  const decisionCountsByStatus = new Map(decisionRows.map((row) => [row.status, Number(row.count)]));

  return QuotePipelineSummary.parse({
    accepted90dCount: decisionCountsByStatus.get('accepted') ?? 0,
    newlySent30dValue: sumQuoteTotals(
      sentRows.filter((row) => row.statusChangedAt >= newlySentWindowStart),
      totalsByQuoteId,
    ),
    openPipelineCount: openRows.length,
    openPipelineValue: sumQuoteTotals(openRows, totalsByQuoteId),
    rejected90dCount: decisionCountsByStatus.get('rejected') ?? 0,
  });
}

/**
 * Quote pricing rows for every live Job still carrying work: at least one Work Slot projected `active`
 * or `scheduled` against plant today. Reads schedule completeness off the Board rather than the Job's
 * latched `completedOn`, so the pipeline drops a Job the moment its last Slot finishes. Cancelled Jobs
 * keep their retained Slots on the Board but never carry pipeline value.
 */
async function listUnfinishedJobQuoteRows({ db, today }: { db: Db; today: DateOnlyIso }): Promise<ReportQuoteRow[]> {
  const [jobRows, offDays, bayRows] = await Promise.all([
    db
      .select({
        deliveryIncluded: quotes.deliveryIncluded,
        deliveryPrice: quotes.deliveryPrice,
        discountPercent: quotes.discountPercent,
        id: quotes.id,
        jobId: jobs.id,
        kind: quotes.kind,
        quotedBasePrice: quotes.quotedBasePrice,
      })
      .from(jobs)
      .innerJoin(quotes, eq(jobs.quoteId, quotes.id))
      .where(isNull(jobs.cancelledAt)),
    listWorkingCalendarOffDays(db),
    findBoardBayRows(db),
  ]);

  if (jobRows.length === 0) {
    return [];
  }

  const { queues } = toProjectedBoard(bayRows, { offDays, today });
  const states = foldJobScheduleStates(
    queues,
    jobRows.map((row) => row.jobId),
  );

  return jobRows.filter((row) => {
    const state = states.get(row.jobId);

    return state !== undefined && state.active + state.scheduled > 0;
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
  const today = toPlantDateOnly(clock());

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
        sentDaysAgo: Math.max(0, diffDateOnlyDays(today, toPlantDateOnly(row.statusChangedAt))),
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

// Windows cover exactly `days` plant days including plant today, anchored to Johannesburg day starts.
function getPlantWindowStartInstant({ days, now }: { days: number; now: Date }): Date {
  const windowStartDate = addDateOnlyDays(toPlantDateOnly(now), -(days - 1));

  return zonedDateStartToUtcInstant(windowStartDate, JOHANNESBURG_TIME_ZONE);
}

function sumQuoteTotals(rows: readonly { id: UUID }[], totalsByQuoteId: ReadonlyMap<UUID, number>): number {
  return rows.reduce((total, row) => total + (totalsByQuoteId.get(row.id) ?? 0), 0);
}
