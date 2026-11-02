# Assignment Attention Is Dismissed for Everyone

A needs-a-look reason (Travel over the threshold, Travel set to 0, a John Deere difference) can be correct as it stands: a Machine really did drive 17 h to the site, or John Deere's last report is stale. Until now nothing let management say so, so the amber marks stayed on the Machine, the Jobs list and the Dashboard and stopped meaning anything. We decided that **a reason is dismissed once, for everyone**: one row per Machine Assignment and kind, with who dismissed it and when. A dismissed reason counts nowhere. The Machine on the web and the phone still shows it, faded, with who dismissed it. A dismissal stands **until a fact the kind reads changes** (Travel for the Travel kinds; either Job Hours or its John Deere snapshot for the difference), when the write that changed it deletes the dismissal and the kind is judged again. Dismissing needs its own permission, `contracting_attention:dismiss`, held by the roles that set Travel; a Foreman sees reasons but cannot dismiss them.

## Considered Options

- **A dismissal per person.** Rejected. Attention is a shared to-do on the Job; one person's dismissal hiding it only for them leaves the list and the Dashboard counting it for everyone else.
- **Fold dismissal into Travel set by hand.** Rejected. Setting Travel corrects the number, so the Travel kinds no longer hold; a dismissal says the number is right. The John Deere difference has no number to set.
- **Store the facts a dismissal saw and compare them on read.** Rejected. Both the domain rule and its SQL twin would have to compare them; deleting the dismissal at the one Assignment write path keeps the reads simple.
- **A separate warnings endpoint.** Rejected. The Jobs list filters and counts needs a look in SQL while it pages, so the twin has to exist anyway; one core module owns the rule's inputs, its twin, the dismissals and the dismiss write instead.

## Consequences

- `attention` on an Assignment is what still needs a look; `dismissedAttention` is what was dismissed and still holds. Phone builds from before this decision read `attention` only and show nothing dismissed.
- A threshold changed in Settings neither revives nor clears a dismissal: it is judged against the stint's facts, not the threshold.
- A dismissal is not recorded in Activity, and it is deleted when it re-arms.
