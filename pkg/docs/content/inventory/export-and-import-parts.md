# Export and import Parts in bulk

The Parts catalog goes out as a CSV and comes back in as the same CSV. Export it, edit it in Excel or
Sheets, and import it again. Which Part each row lands on, and what an edit to a given column does,
is [How a bulk Parts import matches](how-a-bulk-parts-import-matches.md) — read that before your
first edit.

## Steps

1. Open **Parts**.
2. Click **Bulk parts export**. The file downloads as `parts-<date>.csv`.
3. Edit it. Change cells, or add rows for Parts that do not exist yet. Leave the header row and the
   **Code** column alone.
4. Click **Bulk parts import**, choose the file, and leave **CSV has header** ticked.
5. Check the preview and the row issues it lists, then click **Import parts**.

To work one Supplier at a time, use the **Bulk parts export** and **Bulk parts import** buttons on a
Supplier's **Parts** tab instead. Both are scoped to that Supplier: the export writes only its Parts,
and the import refuses a row naming anyone else.

## Notes

- Bad rows do not stop good ones. Every row issue is reported against its line number and the rest of
  the file imports. A frozen **Unit** is the one exception — it stops the whole import, and nothing
  is written.
- Cutting rows out of the file is safe. An import only ever creates and updates, so a Part you delete
  from the CSV is left alone rather than removed.
- Headers are matched loosely: spacing, punctuation, and case are ignored, and `Category` is accepted
  for `Catagory`. Reordering columns in an edited file is safe as long as the header row survives.
- Exporting needs the same permission as reading the Parts list; importing needs permission to manage
  Parts.
