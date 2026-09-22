# Maintain Part categories

Administrators and procurement managers keep the list of Part Categories that every Part is filed under.
Parts pick their Part Category from this list, and the Parts CSV matches its Category column against it.

1. Open **Admin → Part categories**. Each Part Category shows its **Markup** and how many Parts it holds;
   one with no markup yet shows **Not set**.
2. To add one, select **New Part Category**, enter its **Name**, and select **Create**. A name that
   differs from an existing one only by capitals or spacing is refused.
3. To rename one, open it and change its **Name**. The change saves when you leave the field, and every
   Part in that Part Category shows the new name.
4. To set a markup, open the Part Category and enter its **Markup (%)**. It is added to a Part's average
   cost to give its sell price: 25% on an average cost of R 80.00 gives R 100.00. It may be 0% or above
   100%. Clear the field to return it to **Not set**; a Part Category with no markup offers no price,
   never a price at cost. Changing a markup never changes a Quote already written.
5. To add a Part Category while creating or editing a Part, type its name into the **Part Category**
   picker and choose **Create "…"**. The new one is added and selected for that Part.
6. To trace a change, including a markup change, open **Audit** and filter to **Part Category**.
