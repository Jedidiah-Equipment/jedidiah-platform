ALTER TABLE "user" RENAME COLUMN "role" TO "equipment_role";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "equipment_role" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "contracting_role" text;
