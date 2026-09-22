# Add an inventory part to a Quote

Anyone who can edit a Custom Quote can fill in a Work Item Part from the Parts catalog, priced at the Part's
moving-average cost plus its Part Category's Markup %.

1. Open the Custom Quote and find the Work Item.
2. Under **Parts**, select **Add inventory part**. (**Add custom part** adds an empty row to type into.)
3. Search by Part code, name, or Part Category, and pick the Part. In-stock Parts come first; Parts with
   none free can still be picked.
4. Enter how much is being sold:
   - **Most Parts**: the **Quantity**.
   - **Parts bought by length** (tube, bar): the **Length (mm)** of one piece, then how many **Pieces**.
     The row is named with the length, for example `50x50 tube (450 mm)`.
   - **Plate** (a Part with an Average Utilization % set): the **% of plate** the cut part takes up, with no
     allowance for waste, then the **Quantity** of cut parts. The price divides by the Average Utilization %
     to cover the scrap, and the dialog shows the working.
5. Check the **Unit price**, then select **Add to work item**, or **Add and pick another** to add more.
6. Edit the new row like any other. It keeps no link to the Part, so a later cost or Markup % change never
   reprices it.

## On the phone

The steps are the same in the app's Quote editor, with one difference: there is no **Add and pick another**.
Select **Add to work item**, then **Add inventory part** again for the next Part.

If the dialog says the row will be added at R 0.00, price the row by hand, and:

- **This Part has no cost yet**: post a Receipt or opening balance for the Part.
- **The Part Category has no markup set**: set its Markup % under
  [Maintain Part categories](/admin/maintain-part-categories).

Adding a Part reserves nothing and moves no stock. Cut steel and plate are
[periodic stock](/inventory/perpetual-and-periodic-stock), so they are never checked out against the sale either.
