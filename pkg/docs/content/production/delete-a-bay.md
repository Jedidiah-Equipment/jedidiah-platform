# Delete a Bay

Deleting is for a Bay added in error. A Bay the plant has actually worked keeps its schedule history,
so retire that one by disabling it instead.

1. Open **Bays**.
2. Find the Bay in its Department card.
3. Click **Delete Bay** on the Bay.
4. Read the confirmation: the Bay goes for good, and its Bay Calendar Exceptions go with it.
5. Click **Delete Bay** to confirm.

The delete is refused while anything still references the Bay, and the message names what is holding
it: Slots on its Bay Queue, a Product that has it as a default Bay, or Operator Assignment history —
including an Operator who has already been unassigned. Clear the reference if it was also a mistake,
or disable the Bay if the work behind it was real.

Disabling is the other half of this. A disabled Bay rejects new bookings and accepts no new Operator
Assignments, but keeps every Slot it has already run, and it can be re-enabled later. Set it from
**Disabled** in the Bay's edit dialog.
