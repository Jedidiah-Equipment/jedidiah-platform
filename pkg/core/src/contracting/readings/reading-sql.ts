import { type AssignmentAttentionKind, assignmentAttentionKindLevels } from '@pkg/domain/contracting';
import { aiFlaggedVerifications, needsALookLevels } from '@pkg/schema/contracting';
import { type AnyColumn, or, type SQL, sql } from 'drizzle-orm';

type ReadingColumns = Record<'disputed' | 'evidenceReviewedAt' | 'aiVerification', AnyColumn>;

/** Each reading attention kind that can need a look, as the condition that raises it. */
const kindConditions = (reading: ReadingColumns): [AssignmentAttentionKind, SQL][] => [
  ['disputed', sql`${reading.disputed}`],
  ...aiFlaggedVerifications.map(
    (verdict) =>
      [`ai-${verdict}`, sql`(${reading.evidenceReviewedAt} is null and ${reading.aiVerification} = ${verdict})`] as [
        AssignmentAttentionKind,
        SQL,
      ],
  ),
];

/**
 * SQL twin of domain `readingNeedsALookLevel`: the reading's loudest level that needs a look, or null. Built from the
 * domain's kind levels, so the two change together. Takes the table or an alias of it.
 */
export function readingNeedsALookLevelSql(reading: ReadingColumns): SQL<string | null> {
  const conditions = kindConditions(reading);
  const whens = [...needsALookLevels].reverse().flatMap((level) => {
    const raised = conditions.filter(([kind]) => assignmentAttentionKindLevels[kind] === level);
    return raised.length
      ? [sql`when ${or(...raised.map(([, condition]) => condition))} then ${sql.raw(`'${level}'`)}`]
      : [];
  });
  return sql<string | null>`(case ${sql.join(whens, sql` `)} end)`;
}

/** SQL twin of domain `readingNeedsALook`. */
export const readingNeedsALookSql = (reading: ReadingColumns): SQL<boolean> =>
  sql<boolean>`(${readingNeedsALookLevelSql(reading)} is not null)`;
