import { aiVerificationLevel, assignmentAttentionKindLevels } from '@pkg/domain/contracting';
import { aiFlaggedVerifications, type NeedsALookLevel } from '@pkg/schema/contracting';
import { type AnyColumn, type SQL, sql } from 'drizzle-orm';

type ReadingColumns = Record<'disputed' | 'evidenceReviewedAt' | 'aiVerification', AnyColumn>;

const verificationsAt = (level: NeedsALookLevel) =>
  aiFlaggedVerifications.filter((verification) => aiVerificationLevel(verification) === level);

function unreviewedVerdictAt(reading: ReadingColumns, level: NeedsALookLevel): SQL {
  const verdicts = verificationsAt(level);
  if (!verdicts.length) return sql`false`;
  return sql`(${reading.evidenceReviewedAt} is null and ${reading.aiVerification} in (${sql.join(
    verdicts.map((verdict) => sql`${verdict}`),
    sql`, `,
  )}))`;
}

const disputedAt = (reading: ReadingColumns, level: NeedsALookLevel): SQL =>
  assignmentAttentionKindLevels.disputed === level ? sql`${reading.disputed}` : sql`false`;

/**
 * SQL twin of domain `readingNeedsALookLevel`: the reading's loudest level that needs a look, or null. The two
 * change together. Takes the table or an alias of it.
 */
export const readingNeedsALookLevelSql = (reading: ReadingColumns): SQL<NeedsALookLevel | null> =>
  sql<NeedsALookLevel | null>`(case
    when ${disputedAt(reading, 'critical')} or ${unreviewedVerdictAt(reading, 'critical')} then 'critical'
    when ${disputedAt(reading, 'warning')} or ${unreviewedVerdictAt(reading, 'warning')} then 'warning'
  end)`;

/** SQL twin of domain `readingNeedsALook`. */
export const readingNeedsALookSql = (reading: ReadingColumns): SQL<boolean> =>
  sql<boolean>`(${readingNeedsALookLevelSql(reading)} is not null)`;
