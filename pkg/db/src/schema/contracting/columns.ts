import { sql } from 'drizzle-orm';
import { numeric, timestamp } from 'drizzle-orm/pg-core';

export const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
/** Two-decimal quantities: litres, Measure quantities, service hours. */
export const decimal2 = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' });
/** Rand amounts. */
export const money = decimal2;
export const hours = (name: string) => numeric(name, { precision: 10, scale: 1, mode: 'number' });
/** Schema enum tokens as SQL literals; CHECK constraints cannot use query parameters. */
export const quotedList = (values: readonly string[]) =>
  sql
    .join(
      values.map((value) => sql`${value}`),
      sql`, `,
    )
    .inlineParams();
