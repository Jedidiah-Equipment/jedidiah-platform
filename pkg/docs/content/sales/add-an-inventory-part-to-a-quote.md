# Add an inventory part to a Quote

Anyone who can edit a Custom Quote can fill in a Work Item's part row from the Parts catalog instead of
typing the name and working out the price by hand. The price is the Part's average cost marked up by its
Part Category's markup. You never see the cost itself.

1. Open the Custom Quote and find the Work Item the part belongs to.
2. Under **Parts**, select **Add inventory part**. (**Add custom part** still adds an empty row to type
   into.)
3. Search by Part code, name, or Part Category, and pick the Part. The list shows in-stock Parts first and
   how much of each is free. Parts with none free can still be picked, so you can quote something that
   still has to be ordered.
4. Say how much is being sold, which depends on the Part:
   - **Most Parts** are sold by the unit. Enter the **Quantity**.
   - **Tube, bar, and other Parts bought by length**: enter the **Length (mm)** of one piece. It starts at
     the length the Part is bought in. Then enter how many **Pieces** of that length. The row is named
     with the length, for example `50x50 tube (450 mm)`, and the unit price is for one piece.
   - **Plate** (a Part with an Average Utilization % set): enter the **% of plate** the cut part takes up,
     with no allowance for waste. The price covers the scrap too: the dialog shows the working, for
     example `8% of plate ÷ 70% yield = 11.43% of a plate`. The row carries the plate's name, and the
     **Quantity** is how many cut parts.
5. Check the **Unit price**, then select **Add to work item**. To add several Parts in a row, select
   **Add and pick another** instead.

The Quote saves on its own. The new row is an ordinary part row: change its name, quantity, or price
however you need. It keeps no link to the Part, so a later cost or markup change never changes a price
already on a Quote.

## When the price is R 0.00

If no price can be worked out, the dialog says why and the row is added at R 0.00 for you to price by hand:

- **This Part has no cost yet**: nothing has been received or loaded against it. Once a receipt or an
  opening balance gives it a cost, it is priced.
- **The Part Category has no markup set**: ask an administrator or procurement manager to set one under
  [Maintain Part categories](/admin/maintain-part-categories).

## What it does not do

Adding a Part to a Quote reserves nothing and moves no stock; Free Stock stays as it was. Cut steel and
plate are [periodic stock](/inventory/perpetual-and-periodic-stock), so they are never checked out
against the sale either.
