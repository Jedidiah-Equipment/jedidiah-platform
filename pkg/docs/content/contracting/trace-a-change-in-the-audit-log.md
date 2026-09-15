# Trace a change in the Audit Log

The Audit Log records who created, changed, or deleted a Contracting record, and when.

## Steps

1. Open **Audit** under **Admin**. The newest Audit Event appears first.
2. To narrow the log, filter **Entity** to the kind of record — **Machine**, **Implement**, **Category**,
   **Hour Reading**, **Customer**, **Farm**, **Work Type**, or **User** — and **Actor** to the people who
   made the change.
3. Filter **Occurred** to a date range when you know roughly when it happened.
4. Read **Action** and **Summary** to find the change you are investigating.
5. Click **View audit changes** on an event to compare its previous and new values. The action is
   disabled when that event recorded no field-level changes.

The Audit Log is available to a Contracting Administrator and a Super Administrator. It shows only
Contracting records and the people listed under **Users** in Contracting mode; Equipment changes stay in
the Audit Log in Equipment mode.
