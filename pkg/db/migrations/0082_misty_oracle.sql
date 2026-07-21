DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM quote_line_items) THEN
    RAISE EXCEPTION 'quote_line_items still has % rows — inspect and clear them deliberately before this migration drops the table',
      (SELECT count(*) FROM quote_line_items);
  END IF;
END $$;
--> statement-breakpoint
DROP TABLE "quote_line_items";
