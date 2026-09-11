ALTER TABLE "changelog_view" ADD COLUMN "business" text DEFAULT 'equipment' NOT NULL;--> statement-breakpoint
ALTER TABLE "changelog_view" DROP CONSTRAINT "changelog_view_pkey";--> statement-breakpoint
ALTER TABLE "changelog_view" ADD CONSTRAINT "changelog_view_user_id_business_pk" PRIMARY KEY("user_id","business");--> statement-breakpoint
ALTER TABLE "changelog_view" ADD CONSTRAINT "changelog_view_business" CHECK ("changelog_view"."business" IN ('equipment', 'contracting'));--> statement-breakpoint
INSERT INTO "changelog_view" ("user_id", "business", "last_seen_release_at", "updated_at")
SELECT "user_id", 'contracting', "last_seen_release_at", "updated_at" FROM "changelog_view" WHERE "business" = 'equipment';--> statement-breakpoint
ALTER TABLE "changelog_view" ALTER COLUMN "business" DROP DEFAULT;
