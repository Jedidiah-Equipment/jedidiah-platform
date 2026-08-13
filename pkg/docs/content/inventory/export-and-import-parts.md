# Export and import Parts in bulk

The Parts catalog goes out as a CSV and comes back in as the same CSV. Export it, edit it in Excel or
Sheets, and import it again: the columns the export writes are the columns the import reads, in the
same order.

## Steps

1. Open **Parts**.
2. Click **Bulk parts export**. The file downloads as `parts-<date>.csv`.
3. Edit it. Change cells, or add rows for Parts that do not exist yet. Leave the header row alone.
4. Click **Bulk parts import**, choose the file, and leave **CSV has header** ticked.
5. Check the preview and the row issues it lists, then click **Import parts**.

To work one Supplier at a time, use the **Bulk parts export** and **Bulk parts import** buttons on a
Supplier's **Parts** tab instead. Both are scoped to that Supplier: the export writes only its Parts,
and the import refuses a row naming anyone else.

## What decides an update from a new Part

The **Part Code** is the match key, and it is the only one.

- A row whose Code is already in the catalog **updates** that Part.
- A row whose Code is new **creates** one.
- A row that changes nothing counts as neither, so re-importing an untouched export mostly reports
  zero of both. Expect a handful of updates the first time round: the import title-cases some cells,
  so a Part typed into the app in lower case is corrected on its first trip through a CSV.

Every other column is yours to edit: change **Name**, Description, Finish, Catagory, or any other
cell and the Part on that Code is updated to match. The Code cell is the one exception, because it
is what the match is made on — changing it does not re-code the Part, it creates a **second** Part
under the new Code and leaves the original standing. Change a Part's Code on the Part itself.

A Part is its Code plus who supplies it, so a row whose Code already exists **under a different
Supplier** is refused as a conflict and reported by line number. The rest of the file still imports.
Use this when a Supplier Code changes hands: it means the CSV can never quietly re-point a Part at
someone else.

## Notes

- The CSV carries catalog facts only. A Part's Storage Location, its minimum stock, and its
  perpetual or periodic setting are not in the file, and an import leaves them as it found them.
- Suppliers are matched **by name**, ignoring capitalisation. A name that is not on file yet creates
  a Supplier, so a typo in that cell makes a new Supplier rather than an error. Check that column
  before importing.
- A **Built Part** leaves the Supplier cell blank — it is made in-house and bought from nobody — and
  carries `Yes` under Internally Fabricated. A Built Part is never measured in `mm`.
- Supplier, Catagory, Finish, and Name come back **title-cased**: `bearing housing` imports as
  `Bearing Housing`, with technical tokens like `M30`, `SS`, and `UNC` left alone.
- You cannot move a Part to another **Supplier** through the CSV. Editing that cell is the conflict
  above — the row is refused, not re-pointed. Change a Part's Supplier on the Part itself.
- A Part's **Unit** freezes once any stock has moved against it. Unlike a row issue this one stops
  the whole import: nothing is written and the message names the Part. Put the cell back as the
  export wrote it and import again.
- Bad rows do not stop good ones. Every row issue is reported against its line number and the rest
  of the file imports. The frozen Unit above is the only exception.
- Headers are matched loosely — spacing, punctuation, and case are ignored, and `Category` is
  accepted for `Catagory` — so reordering columns in an edited file is safe as long as the header
  row survives.
- Exporting needs the same permission as reading the Parts list; importing needs permission to
  manage Parts.
