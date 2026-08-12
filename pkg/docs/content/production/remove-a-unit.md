# Remove a Unit

Removing is for a machine that was never built — a Unit left holding a serial after its build was
cancelled. A machine the plant actually built keeps its record, whatever happened to the sale.

Only an administrator can remove a Unit.

1. Open **Units** and pick the Unit.
2. Check the **Jobs** card: every Job on it should read **Cancelled**. This is a first look, not proof —
   a Job that finished before its Quote was cancelled reads **Cancelled** too, and the removal will
   refuse it.
3. Click **Remove unit**.
4. Read the confirmation: the Unit goes for good, and its ownership history goes with it.
5. Click **Remove** to confirm.

The cancelled Jobs stay where they are, with their Quotes and their Bay history. They simply stop
naming a machine. The serial is not given back either: serial numbers count up per Product and never
rewind, so a gap in them is the record that a build was started and abandoned.

The removal is refused while the machine is still real, and the message names what holds it: a Job that
is not cancelled, a Job that was completed before it was cancelled, a Customer who owns it, or a Quote
that names it. If a Quote is the only thing holding a machine that was never built, deal with the
Quote first.
