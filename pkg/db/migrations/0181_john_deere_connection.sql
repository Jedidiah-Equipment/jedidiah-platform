CREATE TABLE "contracting"."john_deere_connection" (
	"id" text PRIMARY KEY DEFAULT 'contracting' NOT NULL,
	"status" text DEFAULT 'not-connected' NOT NULL,
	"pending_state" text,
	"pending_state_expires_at" timestamp with time zone,
	"pending_by_user_id" text,
	"refresh_token_ciphertext" text,
	"scopes" text,
	"organizations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"connected_by_user_id" text,
	"connected_at" timestamp with time zone,
	"last_refreshed_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "john_deere_connection_singleton" CHECK ("contracting"."john_deere_connection"."id" = 'contracting'),
	CONSTRAINT "john_deere_connection_status" CHECK ("contracting"."john_deere_connection"."status" IN ('not-connected', 'pending', 'connected', 'needs-reconnect')),
	CONSTRAINT "john_deere_connection_connected_shape" CHECK ("contracting"."john_deere_connection"."status" <> 'connected' OR "contracting"."john_deere_connection"."refresh_token_ciphertext" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "contracting"."john_deere_connection" ADD CONSTRAINT "john_deere_connection_pending_by_user_id_user_id_fk" FOREIGN KEY ("pending_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."john_deere_connection" ADD CONSTRAINT "john_deere_connection_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;