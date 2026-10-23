import { type Db, transcriptionHints, transcriptions, user, withPagination } from '@pkg/db';
import { TRANSCRIPTION_HINT_CAP, transcriptionHintStatus } from '@pkg/domain';
import {
  type Business,
  getNextCursor,
  type TranscriptionHintList,
  TranscriptionHintRow,
  type TranscriptionListInput,
  type TranscriptionListResult,
  TranscriptionReviewItem,
  TranscriptionUser,
} from '@pkg/schema';
import { and, asc, desc, eq, exists, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/** One business's Transcriptions by every user, or only those the chosen people recorded, with where each one's hint derivation stands. */
export async function listTranscriptionReviews({
  db,
  input,
}: {
  db: Db;
  input: TranscriptionListInput;
}): Promise<TranscriptionListResult> {
  const filter = and(
    eq(transcriptions.business, input.business),
    input.createdByUserIds.length > 0 ? inArray(transcriptions.createdByUserId, input.createdByUserIds) : undefined,
  );
  const order = input.sortDirection === 'asc' ? asc : desc;
  const query = db
    .select({
      id: transcriptions.id,
      createdAt: transcriptions.createdAt,
      createdByUserId: transcriptions.createdByUserId,
      createdByName: user.name,
      purpose: transcriptions.purpose,
      language: transcriptions.language,
      rawText: transcriptions.rawText,
      shownText: transcriptions.shownText,
      savedText: transcriptions.savedText,
      hintDerivedAt: transcriptions.hintDerivedAt,
      hintOutcome: transcriptions.hintOutcome,
      hintNoneReason: transcriptions.hintNoneReason,
      // Aggregated, not joined: one Transcription may teach several hints and must still list as one row.
      hintIds: sql<string[]>`array(
        select ${transcriptionHints.id} from ${transcriptionHints}
        where ${transcriptionHints.sourceTranscriptionId} = ${transcriptions.id}
        order by ${transcriptionHints.createdAt}, ${transcriptionHints.id}
      )`,
    })
    .from(transcriptions)
    .innerJoin(user, eq(user.id, transcriptions.createdByUserId))
    .where(filter)
    .orderBy(order(transcriptions.createdAt), order(transcriptions.id))
    .$dynamic();
  const [rows, total] = await Promise.all([withPagination(query, input), db.$count(transcriptions, filter)]);
  const items = rows.map((row) => TranscriptionReviewItem.parse({ ...row, hintStatus: transcriptionHintStatus(row) }));
  return { items, nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }), total };
}

/** The people who have recorded a Voice Note in this business, by name: the choices for filtering its Transcriptions. */
export async function listTranscriptionUsers({
  db,
  business,
}: {
  db: Db;
  business: Business;
}): Promise<TranscriptionUser[]> {
  const recorded = db
    .select({ recorded: sql`1` })
    .from(transcriptions)
    .where(and(eq(transcriptions.business, business), eq(transcriptions.createdByUserId, user.id)));
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(exists(recorded))
    .orderBy(asc(user.name), asc(user.id));
  return rows.map((row) => TranscriptionUser.parse(row));
}

/** Every Transcription Hint in one business's pool, those in force first and newest first within each, with its successor and its source. */
export async function listTranscriptionHints({
  db,
  business,
}: {
  db: Db;
  business: Business;
}): Promise<TranscriptionHintList> {
  const successor = alias(transcriptionHints, 'successor');
  const rows = await db
    .select({
      id: transcriptionHints.id,
      rule: transcriptionHints.rule,
      keyterm: transcriptionHints.keyterm,
      createdAt: transcriptionHints.createdAt,
      retiredAt: transcriptionHints.retiredAt,
      successorId: successor.id,
      successorRule: successor.rule,
      sourceId: transcriptions.id,
      sourceRawText: transcriptions.rawText,
      sourceShownText: transcriptions.shownText,
      sourceSavedText: transcriptions.savedText,
    })
    .from(transcriptionHints)
    .leftJoin(successor, eq(successor.id, transcriptionHints.supersededByHintId))
    .leftJoin(transcriptions, eq(transcriptions.id, transcriptionHints.sourceTranscriptionId))
    .where(eq(transcriptionHints.business, business))
    .orderBy(
      asc(sql`${transcriptionHints.retiredAt} IS NOT NULL`),
      desc(transcriptionHints.createdAt),
      desc(transcriptionHints.id),
    );
  const activeCount = rows.filter((row) => row.retiredAt === null).length;
  const hints = rows.map((row) =>
    TranscriptionHintRow.parse({
      ...row,
      supersededBy: row.successorId === null ? null : { id: row.successorId, rule: row.successorRule },
      source:
        row.sourceId === null
          ? null
          : {
              id: row.sourceId,
              rawText: row.sourceRawText,
              shownText: row.sourceShownText,
              savedText: row.sourceSavedText,
            },
    }),
  );
  return { cap: TRANSCRIPTION_HINT_CAP, activeCount, hints };
}
