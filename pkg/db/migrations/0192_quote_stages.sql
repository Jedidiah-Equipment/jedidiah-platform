ALTER TABLE "equipment"."quote" ADD COLUMN "invoiced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "equipment"."quote" ADD COLUMN "invoiced_by_user_id" text;--> statement-breakpoint
ALTER TABLE "equipment"."quote" ADD COLUMN "sent_back_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "equipment"."quote" ADD COLUMN "sent_back_by_user_id" text;--> statement-breakpoint
ALTER TABLE "equipment"."quote" ADD COLUMN "sent_back_note" text;--> statement-breakpoint
ALTER TABLE "equipment"."quote" ADD CONSTRAINT "quote_invoiced_by_user_id_user_id_fk" FOREIGN KEY ("invoiced_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment"."quote" ADD CONSTRAINT "quote_sent_back_by_user_id_user_id_fk" FOREIGN KEY ("sent_back_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- 1. Invoiced: every live Quote carrying an Invoice Number, dated from the latest audit event that set it from empty.
UPDATE "equipment"."quote" AS q
SET
  "status" = 'invoiced',
  "invoiced_at" = coalesce(stamp."occurred_at", q."updated_at"),
  "invoiced_by_user_id" = stamp."actor_user_id",
  "accepted_at" = coalesce(q."accepted_at", stamp."occurred_at", q."updated_at"),
  "status_changed_at" = coalesce(stamp."occurred_at", q."updated_at")
FROM "equipment"."quote" AS source
LEFT JOIN LATERAL (
  SELECT a."occurred_at", a."actor_user_id"
  FROM "public"."audit_events" AS a
  WHERE a."entity_type" = 'quote'
    AND a."entity_id" = source."id"::text
    AND a."changes" -> 'invoiceNumber' ->> 'from' IS NULL
    AND a."changes" -> 'invoiceNumber' ->> 'to' IS NOT NULL
  ORDER BY a."occurred_at" DESC
  LIMIT 1
) AS stamp ON true
WHERE source."id" = q."id"
  AND q."status" <> 'cancelled'
  AND q."invoice_number" IS NOT NULL;--> statement-breakpoint
-- 2. Backlog: every other Quote that is Awaiting pricing was finished under the old process, so it waits for its Invoice Number.
UPDATE "equipment"."quote" AS q
SET
  "status" = 'awaiting-invoice',
  "accepted_at" = coalesce(q."accepted_at", (live."completed_on"::timestamp AT TIME ZONE 'Africa/Johannesburg')),
  "status_changed_at" = now()
FROM (
  SELECT source."id", job."id" AS "job_id", job."completed_on"
  FROM "equipment"."quote" AS source
  LEFT JOIN "equipment"."job" AS job ON job."quote_id" = source."id" AND job."cancelled_at" IS NULL
) AS live
WHERE live."id" = q."id"
  AND (
    (
      q."status" = 'accepted'
      AND (
        live."completed_on" IS NOT NULL
        OR (live."job_id" IS NULL AND (q."is_parts_sale" OR q."product_unit_id" IS NOT NULL))
      )
    )
    OR (q."kind" = 'custom' AND q."status" IN ('draft', 'sent') AND live."completed_on" IS NOT NULL)
  );--> statement-breakpoint
ALTER TABLE "equipment"."quote" ADD CONSTRAINT "quote_invoiced_shape" CHECK (("equipment"."quote"."status" = 'invoiced') = ("equipment"."quote"."invoice_number" is not null) and ("equipment"."quote"."status" = 'invoiced') = ("equipment"."quote"."invoiced_at" is not null));--> statement-breakpoint
ALTER TABLE "equipment"."quote" ADD CONSTRAINT "quote_sent_back_shape" CHECK (("equipment"."quote"."sent_back_at" is null or "equipment"."quote"."status" = 'accepted') and ("equipment"."quote"."sent_back_at" is null) = ("equipment"."quote"."sent_back_note" is null) and ("equipment"."quote"."sent_back_note" is null or length(trim("equipment"."quote"."sent_back_note")) > 0) and ("equipment"."quote"."sent_back_at" is not null or "equipment"."quote"."sent_back_by_user_id" is null));