# Cancel a Quote

Cancelling ends the sale. The Quote reads **Cancelled**, drops out of every live list and picker, and
cannot be reopened — raise a new Quote instead.

It is also the moment to settle everything the sale left behind. One confirmation shows you the Job it
started and the machine that Job is building, and each of them is a choice you make there and then
rather than a chore to hunt down afterwards.

## Who can cancel what

A Quote nobody has acted on is paperwork, and anyone who can edit Quotes can undo it. That covers the
Quote raised against the wrong Customer, or the one entered twice.

Once a Quote is **Locked** there is something real underneath — it has been accepted, it has allocated
a machine, or it has started a Job — and only an administrator can cancel it. The system refuses the
rest rather than half-cancelling.

## Cancel it

An unlocked Quote is cancelled from its **Status** field; a Locked one from the **Cancel Quote** button
in the header. Both open the same confirmation and do the same thing.

1. Open the Quote.
2. Set **Status** to Cancelled, or click **Cancel Quote**.
3. Read what the confirmation names, and decide on each option below.
4. Type a cancellation reason. It is required, and it is what anyone opening the Quote later will read.
5. Click **Cancel Quote** to confirm.

## What always happens

A machine this Quote sold goes back to Stock. The sale moved it to the Customer; cancelling moves it
back, as a further entry in the machine's ownership history rather than an erasure. The sale did
happen, and the history says so.

Cancelling is refused outright if that machine has since moved on to someone else — a later ownership
entry means another record now depends on this one, and taking the machine back would quietly strip
it from whoever holds it now.

## What you choose

**Also cancel the Job.** Ticked by default, and almost always right: the sale is dead, so the work is
too. Upcoming bay slots come off the schedules; work already done or under way stays on record, as does
any stock already checked out. Untick it only when the build genuinely continues without this
paperwork — the Job stays live and keeps its machine.

**Also remove the Unit.** Offered when the Job was building a machine of its own, and only while that
Job is being cancelled too. Removing deletes the serial and its ownership history for good; the serial
is never issued again, because serial numbers count up per Product and never rewind.

It arrives already ticked when nothing has started — no bay slot under way, no stock drawn against the
Job — which is the ordinary case for a sale that died early. Once either has happened it is offered
unticked instead: metal may already have been cut, and that is a person's call rather than a default.
It is not offered at all once the build carries a completion date. The machine was made, and its record
stands whatever became of the sale.

Leaving it unticked is always safe. The machine simply stays, back in Stock, and can be
[removed later](/production/remove-a-unit) or sold to someone else.

A Quote that allocated a machine we already held is never offered removal. That machine existed before
this sale and outlives it — it returns to Stock and stays on the Units list.

## After cancelling

The Quote keeps its notes, delivery dates, and invoice number editable so the record can still be
tidied. Nothing else about it can change, and the status cannot be moved back.
