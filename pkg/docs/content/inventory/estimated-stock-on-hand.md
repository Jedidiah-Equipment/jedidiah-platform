# Estimated Stock on Hand

Periodic plate stock is deliberately stale between Stock Counts. **Estimated Stock on Hand** is a
read-time expectation of what the next count will find; it does not post a Stock Movement or change
stock on hand.

## What switches it on

**Average utilization %** switches the estimate on for a discrete periodic Part. The percentage is
the usable yield of one plate. For example, 85% means Jobs can consume 85% of a plate's total area
before the remaining 15% is skeleton or scrap and the plate is physically gone. A blank field means
the estimate is off.

The field is an estimate setting, so it can be tuned as the variance report shows how closely the
estimate matched real counts. It is not available on perpetual, linear, or measured Parts.

## How Job demand is entered

A Product's material-line quantity is **part area ÷ plate area**, with no waste allowance. A quantity
of `0.060` means the unit's parts occupy 6% of the plate's total area. Average Utilization % accounts
for the waste; including waste in the material line would count it twice.

Those quantities are the Product Material List, kept under **Raw materials per unit**; see [Maintain a
Product cost estimate](./maintain-a-product-cost-estimate.md). That list sits beside, not inside,
Assemblies: a fabricated Part in an Assembly carries its raw material through the Product Material
List, and an Assembly's own Part quantities are whole counted Parts. So a plate reaches the estimate
only through the Product Material List, never through an Assembly.

Demand is taken from the estimate snapshot frozen when a Product Job is created. Cancelled Jobs do
not contribute. Rework and Service Work Jobs carry no qualifying material lines.

## What the estimate means

The estimate shows whole untouched plates plus the usable remainder of one open plate, such as
**≈ 2 plates + 94% of one.** It assumes one open plate per Part. The remainder carries across Stock
Counts: a count re-anchors the whole-plate quantity but does not pretend the cut partial became a new
plate.

During a stocktake, only whole, untouched plates belong in the count. A cut partial plate is never
stock, in whole or in part. The session variance report shows the estimate beside expected and
counted so Average Utilization % can be calibrated.

Estimated Stock on Hand also supplies the whole-plate stock on hand and Free Stock inputs used by
the buy list for estimator Parts. It does not change the ledger, blind stocktake entry, Stock
Movement rules, moving average cost, or the raw-material drift report.
