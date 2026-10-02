import { aiFlaggedVerifications } from '@pkg/schema/contracting';
import { type AnyColumn, type SQL, sql } from 'drizzle-orm';

type ReadingColumns = Record<'disputed' | 'evidenceReviewedAt' | 'aiVerification', AnyColumn>;

/** SQL twin of domain `readingNeedsALook`; the two change together. Takes the table or an alias of it. */
export const readingNeedsALookSql = (reading: ReadingColumns): SQL<boolean> => sql<boolean>`(
  ${reading.disputed}
  or (
    ${reading.evidenceReviewedAt} is null
    and ${reading.aiVerification} in (${sql.join(
      aiFlaggedVerifications.map((verification) => sql`${verification}`),
      sql`, `,
    )})
  )
)`;
