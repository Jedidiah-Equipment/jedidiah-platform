# Stock on hand, Commitment, and Free Stock

The **Stock on hand** screen shows three quantity columns per Part, and they answer different
questions.

## Stock on hand

What the ledger believes is physically on the rack: every movement ever posted for that Part, added
up. For a linear Part it also breaks down by length, because ten 6 m lengths and ten 300 mm offcuts
are not interchangeable even though both are ten pieces.

A negative figure is flagged in red. It does not mean less than nothing is on the shelf — it means
the rack and the ledger disagree, and the rack is almost certainly right. See
[Warnings are judgments, not blocks](./warnings-are-judgments.md).

## Commitment

What open Jobs still expect to draw. Per Job and Part it is the CFO quantity minus what has already
been drawn, never below zero. A Job's **Stock** tab shows the three figures side by side: **CFO**,
**Drawn**, and **Committed**.

So a Job that specced 10 and has drawn 4 is committed to 6 more. Draw the remaining 6 and the
commitment goes to zero on its own — drawing does not add to demand, it converts it.

## Free

Stock on hand minus every open commitment across all Jobs. This is the column to read before
promising a Part to something new, because it is the only one that accounts for work already in the
building that has not collected its material yet.

Free can go negative while stock on hand is comfortably positive. That means the Jobs already
running have specced more than the rack holds, and it is a signal for procurement rather than a
counting error.

## On order

What Suppliers still owe on open Sent Purchase Order lines. It stays separate from **Free** because
ordered stock is not on the rack yet. A Receipt reduces **On order** and increases **Stock on hand**
when the delivery actually arrives.

## How a commitment ends

Two ways, and neither is a Job status:

- **Close-out.** Recorded once against a completed Job, it releases whatever that Job still had
  committed, permanently. It is not a Job status — it is an inventory-local fact, and reopening is
  not a concept. Later movements can still change what is drawn, so something found afterwards can
  still be returned, but the released demand never comes back. See
  [Close out a Job's stock](./close-out-a-job.md).
- **Cancellation.** Cancelling a Job releases its commitment its own way. A cancelled Job is never
  closed out, but anything it still holds drawn should still be returned.
