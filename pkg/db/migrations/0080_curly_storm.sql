ALTER TABLE "quote" ADD COLUMN "hourly_rate" numeric(12, 2);--> statement-breakpoint
UPDATE "quote" SET "hourly_rate" = 850.00 WHERE "kind" = 'custom';--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_hourly_rate_shape" CHECK ((
        "quote"."kind" = 'custom' and "quote"."hourly_rate" is not null and "quote"."hourly_rate" >= 0
      ) or (
        "quote"."kind" = 'product' and "quote"."hourly_rate" is null
      ));
