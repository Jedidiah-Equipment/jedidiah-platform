import type { TranscriptionHintOutcome } from '@pkg/schema/contracting';
import { sql } from 'drizzle-orm';
import { type AnyPgColumn, check, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from '../auth.js';
import { contractingSchema } from './pg-schema.js';

export const contractingTranscriptions = contractingSchema.table(
  'transcription',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    /** The control's label for what the text is for ("breakdown description"); prompt context, never shown. */
    purpose: text('purpose').notNull(),
    /** The spoken language tag ("en", "af"), from the speech model or else the tidy pass; null when neither gave one. */
    language: text('language'),
    rawText: text('raw_text').notNull(),
    shownText: text('shown_text').notNull(),
    savedText: text('saved_text'),
    savedAt: timestamp('saved_at', { withTimezone: true }),
    hintDerivedAt: timestamp('hint_derived_at', { withTimezone: true }),
    /** What the derivation decided: `added` a hint or `none`; null before it ran, and for rows derived before it was kept. */
    hintOutcome: text('hint_outcome').$type<TranscriptionHintOutcome>(),
    hintNoneReason: text('hint_none_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('transcription_created_by_idx').on(table.createdByUserId, table.createdAt),
    check('transcription_saved_shape', sql`(${table.savedText} IS NULL) = (${table.savedAt} IS NULL)`),
    check('transcription_purpose_not_blank', sql`length(btrim(${table.purpose})) > 0`),
    check(
      'transcription_hint_outcome_shape',
      sql`(${table.hintOutcome} IS NULL OR (${table.hintOutcome} IN ('added', 'none') AND ${table.hintDerivedAt} IS NOT NULL)) AND (${table.hintNoneReason} IS NULL OR ${table.hintOutcome} = 'none')`,
    ),
  ],
);

export const contractingTranscriptionHints = contractingSchema.table(
  'transcription_hint',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rule: text('rule').notNull(),
    /** A proper noun the rule is about, fed to the speech service as a keyterm; null for rules about meaning. */
    keyterm: text('keyterm'),
    sourceTranscriptionId: uuid('source_transcription_id').references(() => contractingTranscriptions.id, {
      onDelete: 'set null',
    }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    supersededByHintId: uuid('superseded_by_hint_id').references((): AnyPgColumn => contractingTranscriptionHints.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('transcription_hint_active_idx').on(table.retiredAt, table.createdAt),
    check('transcription_hint_rule_not_blank', sql`length(btrim(${table.rule})) > 0`),
    check(
      'transcription_hint_keyterm_length',
      sql`${table.keyterm} IS NULL OR length(${table.keyterm}) BETWEEN 1 AND 50`,
    ),
  ],
);
