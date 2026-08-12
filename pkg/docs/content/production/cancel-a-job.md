# Cancel a Job

Cancelling retires a Job that will never be worked — raised in error, or overtaken by a decision made
off the floor. Do not stamp a completion date on it instead: that asserts the work finished, and it
carries the Job into the completed-Jobs sales export alongside real builds.

A Job can be cancelled two ways, and both end in the same place: the Job reads **Cancelled**, it drops
out of every live list, search, and picker, and nothing on it can be edited again. There is no
un-cancel.

Cancel deliberately. A **Stock Build** can simply be raised again. When a Job came from a Quote,
cancelling the Job frees that same Quote to start a replacement while keeping the accepted terms
Locked. Open the Quote, click **Start Job**, and raise the work again. A replacement Build Job keeps the
same Product Unit and Product Serial Number while the Customer still owns that Unit. If the never-built
Unit was removed or its ownership moved elsewhere first, the replacement receives a new one — which is
why cancelling a Job never offers to remove a machine the sale still expects.

## Cancel the Job itself

Use this when the Job is what went wrong — including a **Stock Build**, which has no Quote to cancel.
The Quote behind the Job, if there is one, is left exactly as it was.

A **Stock Build** is offered its machine. Its Unit has no sale behind it, so cancelling can take the
Unit with it — the confirmation shows the serial, who holds it, and a tick box. It arrives already
ticked when nothing has started: no bay slot under way and no stock drawn against the Job. Once either
has happened the box is offered unticked, because metal may already have been cut and that is a
person's call, not a default. Leave it unticked and the Unit stays on the Units list as Stock; you can
still remove it later from the Unit itself.

A Job that came from a Quote is never offered its machine. While the sale stands the Unit belongs to
it, and a replacement Job will reuse that very machine. If the sale is what died, cancel the Quote.

Only an administrator can cancel a Job, and only in the web app.

1. Open the Job and stay on the **Details** tab.
2. Scroll to the bottom and click **Cancel Job**.
3. Read the confirmation: it names how many upcoming slots come off the bay schedules.
4. For a Stock Build, decide whether the machine goes too — see above.
5. Type a cancellation reason. It is required, and it stays on the Job for anyone who opens it later.
6. Click **Cancel Job** to confirm.

The button is not there at all when the Job is already cancelled, when it carries a completion date, or
when you do not hold the permission.

A Job that was completed cannot be cancelled this way. The completion date is the record that the work
happened, so the Job stands. If the sale behind it fell through, cancel the Quote instead.

## Cancel the Quote behind it

Cancelling a Quote that has sourced a Job offers to cancel that Job with it, in one step, and to remove
the machine that Job was building. Use this when the sale is what died. The reason you give is recorded
on the Quote rather than on the Job, so the Job's own cancellation reason stays empty. Unlike cancelling
the Job directly, this reaches a completed Job too.

See [Cancel a Quote](/sales/cancel-a-quote) for that flow.

## What cancellation does to the schedule

Cancelling gives back only the bay time the Job had not started using. Slots that start after today are
removed and the bays behind them close up. Slots that are done or under way stay on the Board and the
Calendar as read-only history, styled as cancelled — the plant did that work, and the record keeps it.

Stock already checked out to the Job stays on its ledger for the same reason. Its outstanding
commitment is released, so the parts it was holding read as free stock again.
