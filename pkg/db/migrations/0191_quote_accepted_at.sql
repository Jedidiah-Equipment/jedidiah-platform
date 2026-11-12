ALTER TABLE "equipment"."quote" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
-- An accepted Quote's status has not changed since it was accepted, so that moment is its acceptance.
UPDATE "equipment"."quote" SET "accepted_at" = "status_changed_at" WHERE "status" = 'accepted';--> statement-breakpoint
ALTER TABLE "equipment"."quote" ADD CONSTRAINT "quote_accepted_shape" CHECK (("equipment"."quote"."status" in ('accepted', 'awaiting-approval', 'awaiting-invoice', 'invoiced')) = ("equipment"."quote"."accepted_at" is not null));
