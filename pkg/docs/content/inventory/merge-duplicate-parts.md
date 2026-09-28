# Merge duplicate Parts

Procurement Managers, Administrators, and Super Administrators can merge a duplicate Part into the Part that should remain.

1. From the **Parts** list, open the duplicate Part that should be removed.
2. Click **Merge into…**.
3. Search for and select the Part that should remain, then click **Continue**.
4. Review the stock on hand, what will move, and any quantities that will be added together.
5. If the preview lists anything to fix first, fix it and open the merge again.
6. Click **Merge part**.
7. Reprint the remaining Part's label for the duplicate's shelf: the duplicate's label no longer scans.

The duplicate's whole history moves to the remaining Part and is replayed as one ledger, so both on-hand and moving-average cost combine. That history includes Stock Movements, Purchase Order lines, BOM lines, Product and Assembly lines, and Jobs.

Where one Product, Assembly, BOM, or Job lists both Parts, their quantities are added together on one line. Empty fields on the remaining Part are filled from the duplicate, and existing values stay unchanged. The duplicate is then deleted permanently, its code is free to reuse, and there is no undo.

A merge is refused while:

- the Parts differ in unit of measure, Standard Purchase Length, Stock Tracking Mode, or whether they are Built Parts
- both Parts are on the same Purchase Order
- the duplicate is on a draft or approved Purchase Order from a different Supplier
- one Part is in the other's Bill of Materials
- a stocktake session is open for the Parts' Stock Tracking Mode
