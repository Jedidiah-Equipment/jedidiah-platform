CREATE SCHEMA "equipment";
--> statement-breakpoint
ALTER SEQUENCE "public"."job_code_seq" SET SCHEMA "equipment";--> statement-breakpoint
ALTER SEQUENCE "public"."purchase_order_code_seq" SET SCHEMA "equipment";--> statement-breakpoint
ALTER SEQUENCE "public"."quote_code_seq" SET SCHEMA "equipment";--> statement-breakpoint
ALTER TABLE "public"."user_department" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."customers" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."credit_note_settlement" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."documents" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."invoice_extraction" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."invoice_flag_resolution" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."feedback" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."feedback_department" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."feedback_user" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job_stock_close_out" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job_bay_calendar_exception" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job_bay_operator_assignment" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job_bay" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job_build_spec_assembly" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job_cfo_assembly" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job_cfo_part" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job_department_crew" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job_department_timing" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job_estimate_snapshot" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job_slot" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."job" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."product_bay" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."product_serial_sequence" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."working_calendar_off_day" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."part_bom" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."parts" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."product_range_variants" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."product_ranges" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."product_unit_ownership_transfer" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."product_unit" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."assembly_overrides" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."assembly_parts" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."product_assemblies" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."product_labor_hours" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."product_material_line" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."products" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."purchase_order_amendment" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."purchase_order_job_link" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."purchase_order_line" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."purchase_order" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."quote_selected_assemblies" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."quote_work_item_parts" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."quote_work_items" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."quote" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."stock_build" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."stock_movement" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."stocktake_session" SET SCHEMA "equipment";
--> statement-breakpoint
ALTER TABLE "public"."supplier" SET SCHEMA "equipment";
