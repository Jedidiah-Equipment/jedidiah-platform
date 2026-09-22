# Merge duplicate Part categories

Administrators, Super Administrators, and Procurement Managers can merge duplicate Part Categories, such as
**Bolt & Nut**, **Bolt & Nuts**, and **Bolts & Nuts**, into the one that should remain.

1. Open **Admin → Part categories** and select **Merge categories…**. From a duplicate's own page, select
   **Merge into…** instead; that duplicate is already chosen.
2. Under **Keep**, search for and select the Part Category that should remain.
3. Under **Merge into it**, select every duplicate, then select **Continue**.
4. Review each Part Category's Part count and markup. Where a duplicate's markup differs from the one you keep,
   a warning says which markup its Parts will take.
5. Select **Merge**.

Every Part on the duplicates moves to the Part Category you kept, which keeps its own name and markup. The
duplicates are deleted permanently with no undo. To trace a merge, open **Audit** and filter to
**Part Category**: each duplicate and the Part Category you kept show a **merged** event.
