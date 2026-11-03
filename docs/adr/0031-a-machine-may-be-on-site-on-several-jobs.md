# A Machine May Be On Site on Several Jobs

A rule that a Machine, or an Implement, is on site on at most one Job at a time stops real work: a Contracting Manager back-loads Jobs a Machine did in the past while it sits on site on a current Job, and a Foreman arrives on his Job while another Foreman's Job never had its departure captured. We decided that **being on site on another Job warns and never refuses**. No index or check limits a Machine or Implement to one on-site Machine Assignment; an arrival saves, and when its Machine or chosen Implement is still on site elsewhere (on another Job, or on another stint of the same Job) the capture returns one sentence per subject naming that Job, which the web and the phone show after the save. Wherever a single Job is named for a Machine or Implement on site on several (On Job on the Fleet page and the phone, the Breakdown default Job, the Job an unsolved Breakdown follows, the stint a phone Driver change writes), it is the stint whose **arrival was captured most recently**.

## Considered Options

- **Refuse, and let management override.** Rejected. Back-loading is routine for the people doing it, and a refusal also catches Foremen who have no way to capture another Job's departure.
- **Warn before the save and ask to confirm.** Rejected. The other Job is not wrong, only unfinished; a confirmation step adds a tap and protects nothing.
- **A new needs-a-look kind on the other Job.** Rejected. That Job's Completion gate already refuses while any Assignment is on site, so the missing departure is surfaced where it must be fixed.
- **Name the Job by the earliest arrival, or by the meter.** Rejected. The latest capture is what the person just did, and a captured-at stamp is never edited, so every reader agrees.

## Consequences

- A unique index on the on-site Assignment would refuse captures production holds; do not add one.
- `stintOnSite` matches several Assignments per subject: a reader that wants one Job orders by `latestArrivalFirst`, arrival capture newest first.
