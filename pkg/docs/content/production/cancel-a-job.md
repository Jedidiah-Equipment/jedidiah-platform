# Cancel a Job

Cancelling retires a Job that will never be worked — raised in error, or overtaken by a decision made
off the floor. Do not stamp a completion date on it instead: that asserts the work finished, and it
carries the Job into the completed-Jobs sales export alongside real builds.

A Job can be cancelled two ways, and both end in the same place: the Job reads **Cancelled**, it drops
out of every live list, search, and picker, and nothing on it can be edited again. There is no
un-cancel. If a Job is cancelled by mistake, raise a new one.

## Cancel the Job itself

Use this when the Job is what went wrong — including a **Stock Build**, which has no Quote to cancel.
The Quote behind the Job, if there is one, is left exactly as it was.

Only an administrator can cancel a Job, and only in the web app.

1. Open the Job and stay on the **Details** tab.
2. Scroll to the bottom and click **Cancel Job**.
3. Read the confirmation: it names how many upcoming slots come off the bay schedules.
4. Type a cancellation reason. It is required, and it stays on the Job for anyone who opens it later.
5. Click **Cancel Job** to confirm.

The button is not there at all when the Job is already cancelled, when it carries a completion date, or
when you do not hold the permission.

A Job that was completed cannot be cancelled this way. The completion date is the record that the work
happened, so the Job stands. If the sale behind it fell through, cancel the Quote instead.

## Cancel the Quote behind it

Cancelling a Quote that has sourced a Job cancels that Job with it, in one step. Use this when the sale
is what died. The reason you give is recorded on the Quote rather than on the Job, so the Job's own
cancellation reason stays empty. Unlike cancelling the Job directly, this reaches a completed Job too.

See the Quote for that flow.

## What cancellation does to the schedule

Cancelling gives back only the bay time the Job had not started using. Slots that start after today are
removed and the bays behind them close up. Slots that are done or under way stay on the Board and the
Calendar as read-only history, styled as cancelled — the plant did that work, and the record keeps it.

Stock already checked out to the Job stays on its ledger for the same reason. Its outstanding
commitment is released, so the parts it was holding read as free stock again.
