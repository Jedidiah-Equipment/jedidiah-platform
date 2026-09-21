CREATE TABLE "equipment"."purchase_order_line_arrival" (
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"note" text,
	"purchase_order_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "purchase_order_line_arrival_quantity_nonzero" CHECK ("equipment"."purchase_order_line_arrival"."quantity" <> 0),
	CONSTRAINT "purchase_order_line_arrival_reversal_note" CHECK ("equipment"."purchase_order_line_arrival"."quantity" > 0 OR length(trim(coalesce("equipment"."purchase_order_line_arrival"."note", ''))) > 0)
);
--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_line_arrival" ADD CONSTRAINT "purchase_order_line_arrival_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_line_arrival" ADD CONSTRAINT "purchase_order_line_arrival_line_id_purchase_order_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "equipment"."purchase_order_line"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_line_arrival" ADD CONSTRAINT "purchase_order_line_arrival_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "equipment"."purchase_order"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_order_line_arrival_order_line_idx" ON "equipment"."purchase_order_line_arrival" USING btree ("purchase_order_id","line_id");