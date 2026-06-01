CREATE TABLE "documents" (
	"byte_size" integer NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"filename" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" text NOT NULL,
	"product_id" uuid,
	"storage_key" text NOT NULL,
	"uploader_user_id" text NOT NULL,
	CONSTRAINT "documents_byte_size_nonnegative" CHECK ("documents"."byte_size" >= 0),
	CONSTRAINT "documents_content_type_nonempty" CHECK (length(trim("documents"."content_type")) > 0),
	CONSTRAINT "documents_filename_nonempty" CHECK (length(trim("documents"."filename")) > 0),
	CONSTRAINT "documents_exactly_one_owner" CHECK ("documents"."owner_type" = 'product' AND "documents"."product_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploader_user_id_user_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_product_id_created_at_idx" ON "documents" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_storage_key_unique" ON "documents" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_product_id_filename_ci_unique" ON "documents" USING btree ("product_id",lower("filename"));