# A Machine May Be On Site on Several Jobs

Partial unique indexes allowed a Machine, and an Implement, at most one on-site Machine Assignment across all Jobs, so a Machine could never be in two places at once. That invariant stopped real work: a Contracting Manager back-loading Jobs a Machine did in the past was refused while the Machine sat on site on a current Job, and a Foreman was refused when another Foreman's Job never had its departure captured. We decided that **being on site on another Job warns and never refuses**. The indexes are dropped; an arrival saves, and when its Machine or chosen Implement is still on site elsewhere (on another Job, or on another stint of the same Job, which the indexes also refused) the capture returns one sentence per subject naming that Job, which the web and the phone show after the save. Wherever a single Job is named for a Machine or Implement on site on several (On Job on the Fleet page and the phone, the Breakdown default Job, the Job an unsolved Breakdown follows), it is the stint whose **arrival was captured most recently**.

## Considered Options

- **Keep the indexes and let management override them.** Rejected. Back-loading is routine for the people doing it, and the block also caught Foremen who had no way to capture another Job's departure.
- **Warn before the save and ask to confirm.** Rejected. The other Job is not wrong, only unfinished; a confirmation step adds a tap and protects nothing.
- **A new needs-a-look kind on the other Job.** Rejected. That Job's Completion gate already refuses while any Assignment is on site, so the missing departure is surfaced where it must be fixed.
- **Name the Job by the earliest arrival, or by the meter.** Rejected. The latest capture is what the person just did, and a captured-at stamp is never edited, so every reader agrees.

## Consequences

- Restoring either index would refuse captures production already holds; do not reinstate them.
- `stintOnSite` is no longer one-per-subject: a reader that wants one Job orders by arrival capture, newest first.
- A phone build from before this decision still captures and simply succeeds where it was refused; it does not show the warning.
