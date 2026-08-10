ALTER TABLE "feedback_department" DROP CONSTRAINT "feedback_department_value_check";--> statement-breakpoint
ALTER TABLE "job_bay" DROP CONSTRAINT "job_bay_department_check";--> statement-breakpoint
ALTER TABLE "quote_work_items" DROP CONSTRAINT "quote_work_items_department_value_check";--> statement-breakpoint
ALTER TABLE "feedback_department" ADD CONSTRAINT "feedback_department_value_check" CHECK ("feedback_department"."department" IN ('procurement', 'supply', 'fabrication', 'paint', 'assembly', 'workshop'));--> statement-breakpoint
ALTER TABLE "job_bay" ADD CONSTRAINT "job_bay_department_check" CHECK ("job_bay"."department" IN ('procurement', 'supply', 'fabrication', 'paint', 'assembly', 'workshop'));--> statement-breakpoint
ALTER TABLE "quote_work_items" ADD CONSTRAINT "quote_work_items_department_value_check" CHECK ("quote_work_items"."department" is null or "quote_work_items"."department" in ('procurement', 'supply', 'fabrication', 'paint', 'assembly', 'workshop'));