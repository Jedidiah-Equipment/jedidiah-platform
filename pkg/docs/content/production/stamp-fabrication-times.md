# Stamp fabrication times

Recording when fabrication started and finished on a Job is what gives each Product an average build
time. Nothing else reads these stamps: they move no Slot, change no Bay Queue, and do not complete
the Job.

## Stamp the start

1. Open the Job and stay on the **Details** tab. On mobile, open the Job from the **Jobs** tab.
2. In the **Fabrication** section, choose **Start fabrication**. On mobile the section starts
   collapsed — tap its heading to open it. The heading carries the status, so you can see whether a
   Job needs a stamp without opening anything.
3. Confirm. The start time is now — there is nothing to type.

If fabrication was due to be on the floor and nobody has stamped a start, the section shows
**Fabrication not started?** as a reminder. It is a nudge, not a block.

## Stamp it done

1. In the **Fabrication** section, choose **Fabrication done**.
2. Check the **Fabricators** — whoever is currently assigned to the fabrication Bays this Job is
   booked into is filled in for you. Add or remove people so the list is who actually crewed it.
3. Choose **Fabrication done**. At least one Fabricator is required.

Only Bay Operators can be named as Fabricators.

## Correct a mistake

1. In the **Fabrication** section, choose **Edit**.
2. Change the start date, the done date, or the Fabricators, then save.
3. To remove the stamps altogether, clear the **Started** date and save. The done date and the
   Fabricators go with it.

Dates cannot be in the future, and the done date cannot be before the start date.

## When the figures lock

Stamps stay editable while the Job is live. Once the Job's **Completed** date is set, the fabrication
section becomes read-only — the done stamp is the fabrication manager stopping that work, while Job
completion is the factory manager closing the whole Job, and completion freezes what came before it.

One exception: if fabrication was started but never stamped done, **Fabrication done** stays available
on a completed Job, so a build that ran past its planned dates can still be recorded. That stamp
cannot be corrected afterwards, so check the Fabricators before saving it.

Cancelled Jobs cannot be stamped at all.

## Where the averages appear

Open the Product and choose **Build times**. It shows the average elapsed working days across that
Product's builds, the build count beside it, and a row per build with its scheduled days against its
actual days.

Figures accumulate from stamped builds only. A Product nobody has stamped reads as **—**, and
stamping does not reach back into builds that finished before this existed.

Administrators also see the **Fabricators** table: each person's average across the builds they
crewed, the number of builds, and the average crew size those builds were worked under. Everyone on a
build carries its full elapsed time — the time is never split between them.
