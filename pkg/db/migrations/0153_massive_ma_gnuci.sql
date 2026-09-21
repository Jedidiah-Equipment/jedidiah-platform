ALTER TABLE "equipment"."stock_movement" DROP CONSTRAINT "stock_movement_purchase_order_line_fk";--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_line" DROP CONSTRAINT "purchase_order_line_pkey";--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_line" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_line" ADD CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_line" ADD CONSTRAINT "purchase_order_line_order_part_unique" UNIQUE ("purchase_order_id","part_id");--> statement-breakpoint
ALTER TABLE "equipment"."stock_movement" ADD CONSTRAINT "stock_movement_purchase_order_line_fk" FOREIGN KEY ("purchase_order_id","part_id") REFERENCES "equipment"."purchase_order_line"("purchase_order_id","part_id") ON DELETE restrict ON UPDATE no action;
