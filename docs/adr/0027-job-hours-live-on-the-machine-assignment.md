# Job Hours Live on the Machine Assignment

A Machine Assignment's arrival and departure hours used to be Hour Readings in the one ledger, ordered by Read At and judged against their time neighbours, the clock rule and John Deere. The field cannot say when a meter was read: a Foreman captures yesterday's departure today, or two Jobs out of order, and the ledger refused him or raised a Dispute for management. Billing needs only the difference between the two numbers. We decided that **Job Hours live on the Machine Assignment, not in the ledger**: an arrival and a departure value, each with a comment and who captured it, under one rule, departure at or above arrival. They carry no Read At and are never compared to another stint or to a reading. The ledger is **spot readings and Telematics Readings** only, still ordered by Read At, each spot reading judged against its time neighbours and the clock rule. **Known Hours** is the higher of the ledger's latest reading and the Machine's latest Job Hours. **Travel Hours** are a snapshot at arrival: the arrival less the Machine's last departure on any Job, clamped at zero, and set by hand when wrong. Disputes are replaced by a non-blocking **John Deere difference**: a linked Machine's typed Job Hours are compared to its latest Telematics Reading, and over the Settings threshold the capture warns and the stint needs a look. Assignment Attention has **one level, needs a look**, which blocks nothing. Reports take **Active Days from the Job's dates**.

## Considered Options

- **Keep one ledger with warnings instead of refusals.** Rejected. A warning on a Read At nobody knows is noise, and the ledger would still order Job Hours by a time the field cannot give.
- **Mirror Job departures into the ledger when they fit.** Rejected. Two patterns behind a conditional: every reader of hours would have to know which readings were mirrored and why.
- **Drop Travel Hours.** Rejected. Travel is billed at the Assignment's rate, so it has to be kept and correctable.
- **Job Hours on the Assignment.** Chosen.

## Consequences

- The "no hour can vanish between Jobs" invariant is given up on purpose. Travel can double-count or miss when Jobs are captured out of order; the clamp stores zero with a badge, and management corrects Travel by hand.
- A Job Hours edit, by the Foreman while his Job is open or by management until it is Invoiced with a reason once there is a Job Card, recomputes Travel until it is set by hand, and returns a Priced Job to Completed.
- The only Completion gate on hours is that no Assignment is still on site; Travel and the John Deere difference never block.
- Reports per Machine read the ledger, so an unlinked Machine with no spot readings shows no Daily Hours; a Job's hours are spread evenly over its dates and marked estimated. Utilisation is coarser.
- Service Due Soon is judged against Known Hours, so a Job capture that brings it inside the threshold sends the same push a spot reading does.
- ADR 0021's online-only capture stands. Its consequence that the ledger is ordered by Read At now holds for spot readings only; for Job Hours the question is moot.
