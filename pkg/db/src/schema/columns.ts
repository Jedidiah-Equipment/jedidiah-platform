import { sql } from 'drizzle-orm';

/** Schema enum tokens as SQL literals; CHECK constraints cannot use query parameters. */
export const quotedList = (values: readonly string[]) =>
  sql
    .join(
      values.map((value) => sql`${value}`),
      sql`, `,
    )
    .inlineParams();
