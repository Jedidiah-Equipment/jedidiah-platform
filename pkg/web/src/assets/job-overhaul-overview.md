# Job Overhaul — What's Changing (Team Overview)

A friendly summary of the structural changes we're making to **Jobs** on the platform.

---

## The 30-second version

We're giving every Job a clearer shape so the floor and the office see the same picture:

1. A **Job** is broken into **Stages** (one per Department).
2. Each Stage is broken into **Stations** (a physical resource that does the work).
3. Every level has **planned dates** and **actual dates**.
4. **Pause** and **Cancel** are independent switches on the Job, not part of progress.
5. **Status is no longer typed in** — it's read off the dates.

---

## The new Job shape

```
JOB
 ├── Stage: Procurement         (due 1–5 May,   actual …)
 │    ├── Station: PO Desk      (due 1–3 May,   actual 1 May – 2 May)
 │    └── Station: Vendor X     (due 1–5 May,   actual 1 May – 5 May)
 │
 ├── Stage: Supply              (due 4–8 May,   actual …)
 │    └── Station: Goods-In Bay
 │
 ├── Stage: Fabrication         (due 6–20 May,  actual …)
 │    ├── Station: Weld Bay 1
 │    └── Station: Weld Bay 2
 │
 ├── Stage: Paint               (due 18–25 May, actual …)
 │    └── Station: Booth A
 │
 └── Stage: Assembly            (due 22–30 May, actual …)
      └── Station: Assembly Bench 3
```

Three things to notice:

- **Five stages now**: Procurement → Supply → Fabrication → Paint → Assembly. *Dispatch is gone* (we'll handle shipping separately).
- **Supply is new**: it's the in-house side of materials — receiving, QC, staging — distinct from Procurement, which is talking to vendors.
- **Stations live under Stages**: a Station is a specific physical resource (Weld Bay 1, Paint Booth A). Each one carries its own dates.

---

## How dates work

Every Job, every Stage, every Station has **four date fields**:

| Field        | Meaning                          |
| ------------ | -------------------------------- |
| Due start    | When we planned to begin         |
| Due end      | When we planned to finish        |
| Actual start | When we actually began           |
| Actual end   | When we actually finished        |

### Setting due dates (the plan)

When a supervisor creates a Job:

1. They enter **either** a target Job start date **or** a target Job end date.
2. The system uses the Product's per-Department durations to fill in every Stage and every Station's due dates automatically.
3. The supervisor can tweak any field before saving.

```
Supervisor enters:  Job due-end = 30 May
                    │
                    ▼  (system walks backwards through durations)
Procurement:        1–5 May     (5 days)
Supply:             4–8 May     (4 days, overlapping is fine)
Fabrication:        6–20 May    (14 days)
Paint:              18–25 May   (7 days)
Assembly:           22–30 May   (8 days)
```

### Setting actual dates (what happened)

- **Department Managers** record actuals by clicking **Start** and **Stop** on a Station.
- When the **first** Station in a Stage starts, the Stage's actual-start is filled in automatically.
- When the **last** Station in a Stage stops, the Stage's actual-end is filled in automatically.
- Same rule rolls up to the Job.

```
Manager clicks Start on PO Desk (a Procurement station)
      │
      ├──► PO Desk actual-start = now
      ├──► Procurement actual-start = now  (it's the first station in Procurement)
      └──► Job actual-start = now          (Procurement is the first stage to begin)
```

### Who can edit dates?

| Action                                  | Department Manager | Supervisor | Admin |
| --------------------------------------- | :----------------: | :--------: | :---: |
| Click Start/Stop on their Stations      |          ✔         |      ✔     |   ✔   |
| Change a due date                       |          ✘         |      ✔     |   ✔   |
| Change an actual date (override)        |          ✘         |      ✔     |   ✔   |
| Add/remove Stations from a Job          |          ✘         |      ✔     |   ✔   |
| Pause / cancel a Job                    |          ✘         |      ✔     |   ✔   |

A supervisor can change *any* date at *any* time. Every change is logged.

---

## Job status — no more dropdowns

We're getting rid of the "Status" dropdown. The Job's status is **automatically calculated** from the dates and two switches:

```
isCancelled?    →  Cancelled
   else
isPaused?       →  Paused
   else
actual-end set? →  Complete
   else
actual-start    →  Active
   else            Not started
```

The same idea works for Stages and Stations:

```
no actual-start          →  Pending
actual-start, no end     →  In progress
actual-end set           →  Complete
```

**Why?** The dates *are* the truth. A Stage either started or it didn't — there's no need to type the word "In progress" anywhere.

---

## Pause and Cancel

- **Pause** stops Start/Stop buttons for department managers. Supervisors can still re-plan dates while paused. Flip it back off when ready.
- **Cancel** does the same. For now it's reversible (we're in prototype mode).
- Neither one touches the existing dates. They are honest history.

---

## Creating Jobs

### From a Quote (the usual path)

A Quote now needs **only a Customer** to exist — everything else (Product, price, discount, valid-until, etc.) is optional until the Quote is sent. This means a salesperson can log a customer enquiry in seconds and fill in the rest later.

A Job can be created from a Quote while it is in **Draft** *or* **Accepted** status. The two are deliberate:

- **Draft → Job**: lets the team kick off production planning informally — useful when the customer has verbally agreed and we want a head start.
- **Accepted → Job**: the formal, post-customer-signoff path.

Once a Quote has been **Sent** (awaiting the customer), the Create Job button is hidden until the customer responds — we don't want to spin up production while terms are out for review. Rejected Quotes can't become Jobs at all.

**Never automatic.** A **"Create Job"** button appears on the Quote row when the Quote is Draft or Accepted. A supervisor clicks it and the Create-Job dialog opens with:

- Customer pre-filled from the Quote (always present)
- Product pre-filled from the Quote *if set* (supervisor can pick one in the dialog if the Quote didn't have one yet)
- All five Stage windows pre-filled from the Product's durations (once Product is chosen)
- All Stations pre-selected per the Product's per-Department default list
- **Every field still editable** before saving

### Without a Quote (stock builds, R&D, warranty)

Same dialog, just no Quote attached. Customer field is optional.

---

## Products carry production knowledge

The Product form now has **five sub-forms** — one per Department. Each one captures:

- How long that Department's work takes (the **duration**)
- Which Stations are used by default (e.g. Paint Booth A, but not Booth B)

That's how the Create-Job dialog knows the default schedule and station list.

---

## What we deliberately deferred

Things we discussed but are **not building yet** — flagged so no one is surprised when they don't appear:

- **Gantt charts** — at Job level and Job-list level (overlap detection on shared Stations). The data model supports it; the UI is later.
- **Station ↔ User links** (a "Department Member" role with Start/Stop on *their* Stations only). For now, only Department Managers Start/Stop, scoped by Department.
- **Per-Station durations** on the Product form. Today it's per-Department only.
- **Gating** — preventing Paint starting before Fabrication ends. For now ordering is **advisory**; the system records what actually happens.
- **One-way completion** — currently nothing latches. Supervisors can re-open a "complete" thing by clearing its actual-end. The audit log is the safety net.

---

## Two short examples

**A misclick on the floor.**
> Tina, a Fabrication manager, accidentally clicked Stop on Weld Bay 1.
> She cannot re-Start it (the system refuses — Stop is recorded).
> She messages Pat, the supervisor. Pat opens the booking, clears the actual-end, and Tina is back to Start. The override is recorded in the Job's history.

**A late-arriving part.**
> Procurement marked Stage complete two weeks ago.
> A late spare part arrives; the team logs a new Procurement-side activity.
> Pat re-opens Procurement (clears actual-end), records the new dates, and re-completes it.
> The Job's overall *actual-end* updates automatically to reflect the latest activity. Workflow History shows the supervisor override.

---

## Quick glossary

| Term                | Meaning                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| **Job**             | One physical product instance, end-to-end                                     |
| **Stage**           | A Department's portion of a Job (Procurement, Supply, …)                      |
| **Station**         | A named physical resource that does work (Weld Bay 1, Paint Booth A)          |
| **Station Booking** | A Job's planned + actual use of a Station                                     |
| **Due dates**       | The plan (start + end)                                                        |
| **Actual dates**    | What really happened (start + end)                                            |
| **Override**        | A supervisor changing a date directly (logged)                                |
| **Sticky**          | A date that's been set manually — it won't be overwritten by auto-calculation |
| **Advisory**        | Stage order is a default for planning, not a rule the system enforces         |

