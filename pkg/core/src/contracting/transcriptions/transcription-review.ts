import { type Db, user, withPagination } from '@pkg/db';
import { contractingTranscriptionHints, contractingTranscriptions } from '@pkg/db/contracting';
import { TRANSCRIPTION_HINT_CAP, transcriptionHintStatus } from '@pkg/domain/contracting';
import { getNextCursor } from '@pkg/schema';
import {
  type TranscriptionHintList,
  TranscriptionHintRow,
  type TranscriptionListInput,
  type TranscriptionListResult,
  TranscriptionReviewItem,
  TranscriptionUser,
} from '@pkg/schema/contracting';
import { asc, desc, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

/** Every user's Transcriptions, or only those the chosen people recorded, with where each one's hint derivation stands. */
export async function listTranscriptionReviews({
  db,
  input,
}: {
  db: Db;
  input: TranscriptionListInput;
}): Promise<TranscriptionListResult> {
  const filter =
    input.createdByUserIds.length > 0
      ? inArray(contractingTranscriptions.createdByUserId, input.createdByUserIds)
      : undefined;
  const order = input.sortDirection === 'asc' ? asc : desc;
  const query = db
    .select({
      id: contractingTranscriptions.id,
      createdAt: contractingTranscriptions.createdAt,
      createdByUserId: contractingTranscriptions.createdByUserId,
      createdByName: user.name,
      purpose: contractingTranscriptions.purpose,
      language: contractingTranscriptions.language,
      rawText: contractingTranscriptions.rawText,
      shownText: contractingTranscriptions.shownText,
      savedText: contractingTranscriptions.savedText,
      hintDerivedAt: contractingTranscriptions.hintDerivedAt,
      hintOutcome: contractingTranscriptions.hintOutcome,
      hintNoneReason: contractingTranscriptions.hintNoneReason,
      // Aggregated, not joined: one Transcription may teach several hints and must still list as one row.
      hintIds: sql<string[]>`array(
        select ${contractingTranscriptionHints.id} from ${contractingTranscriptionHints}
        where ${contractingTranscriptionHints.sourceTranscriptionId} = ${contractingTranscriptions.id}
        order by ${contractingTranscriptionHints.createdAt}, ${contractingTranscriptionHints.id}
      )`,
    })
    .from(contractingTranscriptions)
    .innerJoin(user, eq(user.id, contractingTranscriptions.createdByUserId))
    .where(filter)
    .orderBy(order(contractingTranscriptions.createdAt), order(contractingTranscriptions.id))
    .$dynamic();
  const [rows, total] = await Promise.all([withPagination(query, input), db.$count(contractingTranscriptions, filter)]);
  const items = rows.map((row) => TranscriptionReviewItem.parse({ ...row, hintStatus: transcriptionHintStatus(row) }));
  return { items, nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }), total };
}

/** The people who have recorded a Voice Note, by name: the choices for filtering the Transcriptions. */
export async function listTranscriptionUsers({ db }: { db: Db }): Promise<TranscriptionUser[]> {
  const recorded = db
    .select({ recorded: sql`1` })
    .from(contractingTranscriptions)
    .where(eq(contractingTranscriptions.createdByUserId, user.id));
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(exists(recorded))
    .orderBy(asc(user.name), asc(user.id));
  return rows.map((row) => TranscriptionUser.parse(row));
}

/** Every Transcription Hint, those in force first and newest first within each, with its successor and its source. */
export async function listTranscriptionHints({ db }: { db: Db }): Promise<TranscriptionHintList> {
  const successor = alias(contractingTranscriptionHints, 'successor');
  const rows = await db
    .select({
      id: contractingTranscriptionHints.id,
      rule: contractingTranscriptionHints.rule,
      keyterm: contractingTranscriptionHints.keyterm,
      createdAt: contractingTranscriptionHints.createdAt,
      retiredAt: contractingTranscriptionHints.retiredAt,
      successorId: successor.id,
      successorRule: successor.rule,
      sourceId: contractingTranscriptions.id,
      sourceRawText: contractingTranscriptions.rawText,
      sourceShownText: contractingTranscriptions.shownText,
      sourceSavedText: contractingTranscriptions.savedText,
    })
    .from(contractingTranscriptionHints)
    .leftJoin(successor, eq(successor.id, contractingTranscriptionHints.supersededByHintId))
    .leftJoin(
      contractingTranscriptions,
      eq(contractingTranscriptions.id, contractingTranscriptionHints.sourceTranscriptionId),
    )
    .orderBy(
      asc(sql`${contractingTranscriptionHints.retiredAt} IS NOT NULL`),
      desc(contractingTranscriptionHints.createdAt),
      desc(contractingTranscriptionHints.id),
    );
  const activeCount = await db.$count(contractingTranscriptionHints, isNull(contractingTranscriptionHints.retiredAt));
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
