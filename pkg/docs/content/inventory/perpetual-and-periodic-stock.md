# Perpetual and periodic Parts

Every Part is tracked one of two ways, set by **Stock tracking** on the Part itself. The choice
decides how much bookkeeping the Part costs you, and how much its number can be trusted between
counts.

## Perpetual

Every movement is recorded: Receipts, Checkouts, Returns to Store, builds, adjustments. The stock on
hand figure is the sum of all of them, so it is live. The **Count status** column reads **Live**.

This is the right setting for anything worth chasing individually — bought assemblies, expensive
fittings, anything a Job's CFO calls for by name.

## Periodic

Only three things are recorded: the Part's opening balance, its Receipts, and its counts. Nothing is
recorded when the Part is consumed, because consumption is not worth the paperwork — these are the
Parts nobody signs out one at a time.

A periodic Part refuses consumption movements outright. It cannot be checked out to a Job, and every
adjustment reason except **Opening balance** and **Stock count** is rejected. Receipts are the
deliberate exception: bought-in raw material still arrives on a Purchase Order, and that Receipt is
the baseline the next count corrects.

## Why a periodic number reads high

Between counts, a periodic Part's stock on hand is deliberately stale, and stale means high — it has
been receiving arrivals and recording none of the consumption. That is not a bug to be corrected by
guessing; it is the trade being made. Only a count corrects it.

The **Count status** column says which state a periodic Part is in: **No count yet**, or **As of last
count** with the date. Read that date before you trust the number. A periodic Part counted in March
is telling you what was true in March.
