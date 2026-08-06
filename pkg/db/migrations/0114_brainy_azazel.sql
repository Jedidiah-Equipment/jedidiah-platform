CREATE TABLE "invoice_extraction" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid PRIMARY KEY NOT NULL,
	"extraction" jsonb
);
--> statement-breakpoint
CREATE TABLE "invoice_flag_resolution" (
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"document_id" uuid NOT NULL,
	"flag_key" text NOT NULL,
	"kind" text NOT NULL,
	"stock_movement_id" uuid,
	CONSTRAINT "invoice_flag_resolution_pkey" PRIMARY KEY("document_id","flag_key"),
	CONSTRAINT "invoice_flag_resolution_flag_key_nonempty" CHECK (length(trim("invoice_flag_resolution"."flag_key")) > 0),
	CONSTRAINT "invoice_flag_resolution_kind_check" CHECK ("invoice_flag_resolution"."kind" IN ('applied', 'dismissed')),
	CONSTRAINT "invoice_flag_resolution_shape" CHECK (("invoice_flag_resolution"."kind" = 'applied' AND "invoice_flag_resolution"."stock_movement_id" IS NOT NULL) OR ("invoice_flag_resolution"."kind" = 'dismissed' AND "invoice_flag_resolution"."stock_movement_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "invoice_extraction" ADD CONSTRAINT "invoice_extraction_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_flag_resolution" ADD CONSTRAINT "invoice_flag_resolution_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_flag_resolution" ADD CONSTRAINT "invoice_flag_resolution_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_flag_resolution" ADD CONSTRAINT "invoice_flag_resolution_stock_movement_id_stock_movement_id_fk" FOREIGN KEY ("stock_movement_id") REFERENCES "public"."stock_movement"("id") ON DELETE restrict ON UPDATE no action;