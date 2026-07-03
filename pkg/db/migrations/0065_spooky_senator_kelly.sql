ALTER TABLE "quote" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "kind" text DEFAULT 'product' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "work_title" text;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_kind_shape" CHECK ((
        "quote"."kind" = 'product' and "quote"."product_id" is not null and "quote"."work_title" is null
      ) or (
        "quote"."kind" = 'custom' and "quote"."product_id" is null and "quote"."work_title" is not null and length(trim("quote"."work_title")) > 0
      ));
