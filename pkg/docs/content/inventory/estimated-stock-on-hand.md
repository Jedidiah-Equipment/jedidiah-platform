# Estimated Stock on Hand

Periodic plate stock is deliberately stale between Stock Counts. **Estimated Stock on Hand** is a
read-time expectation of what the next count will find; it does not post a Stock Movement or change
stock on hand.

## What switches it on

Set **Average utilization %** on a discrete periodic Part. The percentage is the usable yield of one
plate. For example, 85% means Jobs can consume 85% of a plate's total area before the remaining 15%
is skeleton or scrap and the plate is physically gone. Clearing the field switches the estimate off.

The field is an estimate setting, so it can be tuned as the variance report shows how closely the
estimate matched real counts. It is not available on perpetual, linear, or measured Parts.

## How Job demand is entered

A Product's material-line quantity must be **part area ÷ plate area**, with no waste allowance. A
quantity of `0.060` means the unit's parts occupy 6% of the plate's total area. Average Utilization %
accounts for the waste; including waste in the material line would count it twice.

Demand is taken from the estimate snapshot frozen when a Product Job is created. Cancelled Jobs do
not contribute. Rework and Custom Jobs carry no qualifying material lines.

## What the estimate means

The estimate shows whole untouched plates plus the usable remainder of one open plate, such as
**≈ 2 plates + 94% of one.** It assumes one open plate per Part. The remainder carries across Stock
Counts: a count re-anchors the whole-plate quantity but does not pretend the cut partial became a new
plate.

During a stocktake, count only whole, untouched plates. Never count a cut partial plate, in whole or
in part. The session variance report shows the estimate beside expected and counted so Average
Utilization % can be calibrated.

Estimated Stock on Hand also supplies the whole-plate stock on hand and Free Stock inputs used by
the buy list for estimator Parts. It does not change the ledger, blind stocktake entry, Stock
Movement rules, moving average cost, or the raw-material drift report.
