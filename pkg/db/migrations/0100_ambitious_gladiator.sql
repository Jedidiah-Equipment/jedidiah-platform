CREATE TABLE "stock_movement" (
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delta" numeric(14, 3) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"length_mm" integer,
	"movement_type" text NOT NULL,
	"note" text,
	"part_id" uuid NOT NULL,
	"reason" text,
	"unit_cost" numeric(12, 2),
	CONSTRAINT "stock_movement_length_mm_positive" CHECK ("stock_movement"."length_mm" IS NULL OR "stock_movement"."length_mm" > 0),
	CONSTRAINT "stock_movement_type_check" CHECK ("stock_movement"."movement_type" IN ('adjustment', 'revaluation')),
	CONSTRAINT "stock_movement_reason_check" CHECK ("stock_movement"."reason" IS NULL OR "stock_movement"."reason" IN ('opening-balance', 'stock-count', 'damage', 'scrap', 'correction')),
	CONSTRAINT "stock_movement_note_nonempty" CHECK ("stock_movement"."note" IS NULL OR length(trim("stock_movement"."note")) > 0),
	CONSTRAINT "stock_movement_unit_cost_nonnegative" CHECK ("stock_movement"."unit_cost" IS NULL OR "stock_movement"."unit_cost" >= 0),
	CONSTRAINT "stock_movement_shape" CHECK ((
        "stock_movement"."movement_type" = 'adjustment'
        AND "stock_movement"."reason" IS NOT NULL
        AND ("stock_movement"."reason" = 'opening-balance' OR "stock_movement"."note" IS NOT NULL)
        AND ("stock_movement"."unit_cost" IS NULL OR "stock_movement"."reason" = 'opening-balance')
      ) OR (
        "stock_movement"."movement_type" = 'revaluation'
        AND "stock_movement"."delta" = 0
        AND "stock_movement"."unit_cost" IS NOT NULL
        AND "stock_movement"."reason" IS NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movement_part_created_idx" ON "stock_movement" USING btree ("part_id","created_at","id");