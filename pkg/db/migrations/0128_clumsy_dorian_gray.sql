ALTER TABLE "purchase_order" DROP CONSTRAINT "purchase_order_status_check";--> statement-breakpoint
ALTER TABLE "purchase_order" DROP CONSTRAINT "purchase_order_sent_at_shape";--> statement-breakpoint
ALTER TABLE "purchase_order" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
-- Sent orders predate approval, so "sent implies approved" is made true of history here rather than
-- special-cased in every reader downstream. Drafts cancelled before sending stay unapproved.
UPDATE "purchase_order" SET "approved_at" = "sent_at" WHERE "status" = 'sent';--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_approved_at_shape" CHECK (("purchase_order"."status" = 'draft' AND "purchase_order"."approved_at" IS NULL) OR ("purchase_order"."status" IN ('approved', 'sent') AND "purchase_order"."approved_at" IS NOT NULL) OR "purchase_order"."status" = 'cancelled');--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_status_check" CHECK ("purchase_order"."status" IN ('draft', 'approved', 'sent', 'cancelled'));--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_sent_at_shape" CHECK (("purchase_order"."status" IN ('draft', 'approved') AND "purchase_order"."sent_at" IS NULL) OR ("purchase_order"."status" = 'sent' AND "purchase_order"."sent_at" IS NOT NULL) OR "purchase_order"."status" = 'cancelled');