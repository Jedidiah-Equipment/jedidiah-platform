# Warnings are judgments, not blocks

When something you are about to post disagrees with what the system expected, it tells you and then
gets out of the way. A yellow **Check this movement** panel appears, listing what looks off, and ends
with the same sentence every time:

> You can still post this movement.

The submit button changes to say so, wherever you are: **Check out stock** becomes **Check out
anyway**, **Return stock** becomes **Return anyway**, **Post build** becomes **Build anyway**,
**Receive** becomes **Receive it anyway**, and **Post return** becomes **Post it anyway**.

On the stores tablet the same warning opens **Check this movement** before anything is posted, with
**Post anyway** and **Go back**. Going back records nothing at all.

Nothing is disabled. Nothing needs an override code or someone else's password.

This is deliberate. The rack is the fact and the ledger is the record of it. When the two disagree,
the person standing at the rack is the one who can see which is right, and stopping them from
recording what actually happened would only push the truth off the ledger and into somebody's head.

## What it warns about

| Warning | What it means |
| --- | --- |
| This draw exceeds the Job CFO. | The Job is taking more of this Part than its CFO specced. |
| This draw will take stock on hand negative. | The ledger thinks there is less on the rack than you are drawing. |
| This return exceeds the quantity currently drawn. | You are returning more than this Job took out. |
| This receipt takes the line past the quantity ordered. | The delivery is bigger than the Purchase Order line. |
| This return sends back more than the line ever received. | You are sending a Supplier more of this Part than that Purchase Order line took in. |
| This differs from what the BOM calls for. | A build consumed something other than BOM quantity × units built. |

## When posting anyway is the right call

Most of the time. A draw past the CFO usually means the CFO was optimistic, or the job needed a
second one after the first was cut wrong. A receipt past the ordered quantity usually means the
supplier sent a full box. Negative stock on hand almost always means the rack was right and the
ledger was stale — the movement that took it negative is what makes that visible.

The judgment is yours, and you make it once. The warning you see before posting is the same one the
ledger works out for itself, so agreeing with it and posting does not raise it again.

## When to stop and check

Stop if the warning describes something you cannot account for — a return larger than anything the
Job ever drew, or a negative that is far bigger than a miscount would explain. That is not a stale
ledger, it is a movement posted against the wrong Part or the wrong Job earlier. Movements are never
edited or deleted, so the fix is another movement, and it is worth working out which one before you
add to the pile.
