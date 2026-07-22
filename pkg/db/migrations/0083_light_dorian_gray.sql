ALTER TABLE "quote" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
UPDATE "quote"
SET "cancellation_reason" = 'Reason not recorded (cancelled before cancellation reasons were required).'
WHERE "status" = 'cancelled';--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_cancellation_reason_shape" CHECK ((
        "quote"."status" = 'cancelled'
        and "quote"."cancellation_reason" is not null
        and length(trim("quote"."cancellation_reason")) > 0
      ) or (
        "quote"."status" <> 'cancelled'
        and "quote"."cancellation_reason" is null
      ));
