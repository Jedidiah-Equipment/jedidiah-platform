# Stamp Department work times

Record when Fabrication, Paint, Assembly, or Workshop work starts and finishes on a Job. These stamps
move no Slot, change no Bay Queue, and do not complete the Job.

## Stamp the start

1. Open the Job and stay on the **Details** tab. On mobile, open the Job from the **Jobs** tab.
2. Find the Department's work-time section and choose **Start** followed by the Department name. On
   mobile, tap the section's heading to open it first.
3. Confirm. The start time is now — there is nothing to type.

If Fabrication was due to be on the floor and nobody has stamped a start, the section shows
**Fabrication not started?** as a reminder. It is a nudge, not a block.

## Stamp it done

1. In the Department's section, choose the button ending in **done**.
2. Check the **Crew members** — whoever is currently assigned to that Department's Bays for this Job
   is filled in for you. Add or remove people so the list is who actually crewed it.
3. Choose the **done** button again. At least one crew member is required.

Only Bay Operators can be named as Department Crew.

## Correct a mistake

1. In the Department's section, choose **Edit times**.
2. Change the start date, the done date, or the Crew members, then save.
3. To remove the stamps altogether, clear the **Started** date and save. The done date and the
   Crew members go with it.

Dates cannot be in the future, and the done date cannot be before the start date.

## When the figures lock

Stamps stay editable while the Job is live. Once the Job's **Completed** date is set, each Department
section becomes read-only — the done stamp is the Department manager stopping that work, while Job
completion is the factory manager closing the whole Job, and completion freezes what came before it.

One exception: if Department work was started but never stamped done, its **done** button stays
available on a completed Job, so work that ran past its planned dates can still be recorded. That
stamp cannot be corrected afterwards, so check the Crew members before saving it.

Cancelled Jobs cannot be stamped at all.

## Where Fabrication averages appear

Open the Product and choose **Build times**. It shows the average elapsed working days across that
Product's builds, the build count beside it, and a row per build with its scheduled days against its
actual days.

Figures accumulate from stamped builds only. A Product nobody has stamped reads as **—**, and
stamping does not reach back into builds that finished before this existed.

Administrators also see the **Fabricators** table: each person's average across the Fabrication builds they
crewed, the number of builds, and the average crew size those builds were worked under. Everyone on a
build carries its full elapsed time — the time is never split between them.
