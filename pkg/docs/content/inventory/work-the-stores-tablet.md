# Work the stores tablet

The stores tablet is the shared device in the warehouse. Everything physical happens here:
Checkouts, Returns to Store, Receipts, Returns to Supplier, and closing out a Job's stock.

The tablet stays signed in. You never sign in or out of it — you only say who you are. Its account is
a **Device Account**, which is why it can never be the name on a movement: it has to name one of you.

## Say who you are

Nothing moves until the tablet knows who is at it. The name shows in large type at the top of every
screen.

1. Scan your badge card at the scan field, **or** tap the name panel and tap your name.
2. Check the big name is yours before you move anything.
3. Tap **Done** when you walk away.

The tablet forgets you after a few minutes of no activity, and the action buttons switch off until
someone chooses a name again. Reads keep working with nobody selected — you can look up a Part
without saying who you are — but nothing moves. That is not just the buttons being polite: the
system refuses a movement from the tablet with no name on it, so stock is never recorded as having
been fetched by a machine.

Your name goes on every movement you post, so fix a wrong name before you post rather than after:
movements are never edited or deleted.

If your badge says it is not recognised, tap your name instead and tell the office — the card needs
reprinting, or your role needs setting.

## Find a Part

1. Scan the Part label. The tablet opens that Part.
2. If the label will not read, use the camera button beside the scan field.
3. If it is too damaged for the camera, type part of the Part code or name into **Can't scan the
   label?** and tap the Part in the list.

The Part screen shows what is on hand, what is free, and what is committed, plus the lengths on the
rack for a linear Part. It shows no prices — the Stores role does not see them anywhere.

## Move the stock

Every movement starts by finding the Part, then tapping one of the four actions on its screen. The
tablet asks the same questions the web app does, so the steps live with each workflow:

- [Check out Parts to a Job](./check-out-parts-to-a-job.md)
- [Return to Store](./return-to-store.md)
- [Post a Receipt](./post-a-receipt.md) — tap the Purchase Order the delivery belongs to; the
  quantity still due is filled in for you, so correct it when the delivery is short. An order whose
  lines are already full is still listed, marked **Fully received** and filling in nothing: a late
  extra delivery is still a delivery, and it warns rather than refusing you.
- [Return stock to a Supplier](./return-stock-to-a-supplier.md) — you never enter a value; the
  return reverses at what the stock was worth when it arrived.

Quantities are always typed. Scanning a label ten times does not mean ten.

## Close out a Job

From the scan home, tap **Close-out queue**. The oldest Jobs are worth doing first. Tapping a
leftover row opens Return to Store with the Job already filled in. See
[Close out a Job's stock](./close-out-a-job.md).

## If it warns you

Some posts come back with **Check this movement**. It has already been posted — the stock physically
moved, and the ledger records what happened. Read it, tap **Got it**, and tell the office if it was
not what you meant. See [Warnings are judgments, not blocks](./warnings-are-judgments.md).

## Notes

- Periodic Parts can be received and returned to their Supplier, but not checked out. See
  [Perpetual and periodic Parts](./perpetual-and-periodic-stock.md).
- The tablet needs its dock connection. There is no offline mode.
- Badge cards are printed from the user's record. See [Print Part Labels](./print-part-labels.md).
