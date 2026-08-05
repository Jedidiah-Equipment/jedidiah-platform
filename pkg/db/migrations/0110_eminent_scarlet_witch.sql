CREATE TABLE "credit_note_settlement" (
	"document_id" uuid NOT NULL,
	"stock_movement_id" uuid NOT NULL,
	CONSTRAINT "credit_note_settlement_pkey" PRIMARY KEY("document_id","stock_movement_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_amendment" (
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"new_part_id" uuid,
	"new_quantity" numeric(14, 3) NOT NULL,
	"note" text NOT NULL,
	"old_quantity" numeric(14, 3),
	"part_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	CONSTRAINT "purchase_order_amendment_kind_check" CHECK ("purchase_order_amendment"."kind" IN ('quantity-change', 'add-line', 'substitute-part')),
	CONSTRAINT "purchase_order_amendment_note_nonempty" CHECK (length(trim("purchase_order_amendment"."note")) > 0),
	CONSTRAINT "purchase_order_amendment_new_quantity_positive" CHECK ("purchase_order_amendment"."new_quantity" > 0),
	CONSTRAINT "purchase_order_amendment_old_quantity_positive" CHECK ("purchase_order_amendment"."old_quantity" IS NULL OR "purchase_order_amendment"."old_quantity" > 0),
	CONSTRAINT "purchase_order_amendment_shape" CHECK ((
        "purchase_order_amendment"."kind" = 'quantity-change'
        AND "purchase_order_amendment"."new_part_id" IS NULL
        AND "purchase_order_amendment"."old_quantity" IS NOT NULL
      ) OR (
        "purchase_order_amendment"."kind" = 'add-line'
        AND "purchase_order_amendment"."new_part_id" IS NULL
        AND "purchase_order_amendment"."old_quantity" IS NULL
      ) OR (
        "purchase_order_amendment"."kind" = 'substitute-part'
        AND "purchase_order_amendment"."new_part_id" IS NOT NULL
        AND "purchase_order_amendment"."new_part_id" <> "purchase_order_amendment"."part_id"
        AND "purchase_order_amendment"."old_quantity" IS NOT NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_type_check";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_reason_check";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_shape";--> statement-breakpoint
ALTER TABLE "credit_note_settlement" ADD CONSTRAINT "credit_note_settlement_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_note_settlement" ADD CONSTRAINT "credit_note_settlement_stock_movement_id_stock_movement_id_fk" FOREIGN KEY ("stock_movement_id") REFERENCES "public"."stock_movement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_amendment" ADD CONSTRAINT "purchase_order_amendment_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_amendment" ADD CONSTRAINT "purchase_order_amendment_new_part_id_parts_id_fk" FOREIGN KEY ("new_part_id") REFERENCES "public"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_amendment" ADD CONSTRAINT "purchase_order_amendment_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_amendment" ADD CONSTRAINT "purchase_order_amendment_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_note_settlement_stock_movement_unique" ON "credit_note_settlement" USING btree ("stock_movement_id");--> statement-breakpoint
CREATE INDEX "purchase_order_amendment_purchase_order_idx" ON "purchase_order_amendment" USING btree ("purchase_order_id","created_at","id");--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_type_check" CHECK ("stock_movement"."movement_type" IN ('adjustment', 'revaluation', 'checkout', 'return-to-store', 'receipt', 'return-to-supplier', 'build-consume', 'build-produce'));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_reason_check" CHECK ("stock_movement"."reason" IS NULL OR "stock_movement"."reason" IN ('opening-balance', 'stock-count', 'damage', 'scrap', 'correction', 'wrong-item', 'defective', 'order-error'));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_shape" CHECK ((
        "stock_movement"."movement_type" = 'adjustment'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."reason" IN ('opening-balance', 'stock-count', 'damage', 'scrap', 'correction')
        AND ("stock_movement"."reason" = 'opening-balance' OR "stock_movement"."note" IS NOT NULL)
        AND ("stock_movement"."unit_cost" IS NULL OR "stock_movement"."reason" = 'opening-balance')
      ) OR (
        "stock_movement"."movement_type" = 'revaluation'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."delta" = 0
        AND "stock_movement"."unit_cost" IS NOT NULL
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'checkout'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."delta" < 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'return-to-store'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'receipt'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NOT NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
        AND "stock_movement"."unit_cost" IS NOT NULL
      ) OR (
        "stock_movement"."movement_type" = 'return-to-supplier'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NOT NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."delta" < 0
        AND "stock_movement"."reason" IN ('wrong-item', 'defective', 'order-error')
      ) OR (
        "stock_movement"."movement_type" = 'build-consume'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NOT NULL
        AND "stock_movement"."delta" < 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'build-produce'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NOT NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
      ));