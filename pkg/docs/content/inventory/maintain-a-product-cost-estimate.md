# Maintain a Product cost estimate

A Product Cost Estimate combines the Product's raw materials per unit, effective Assembly Parts,
and labor per unit at current inventory costs and the shared labor rates.

## Steps

1. Open **Parts** and open each raw material that the Product consumes. Set **Stock tracking** to
   **Periodic** and save the Part. Only periodic-stock Parts can be added as Product raw material.
2. Open **Products**, open the Product, and select **Costing**.
3. Under **Raw materials per unit**, select a raw material and press **Add**, then enter its
   **Quantity per unit**.
4. Under **Labor per unit**, add each Department involved and enter its **Hours per unit**.
5. Wait for the saved status. Adding or removing a line saves the whole Product Material List and
   labor-hours list together.
6. Read **Live cost estimate**. It separates raw materials, Assembly Parts, and labor, then compares
   the total with the Product's Base Price.
7. If the total begins with **≥**, read the missing-input line and complete the named material list,
   labor hours, or uncosted bought Parts. The displayed amount is a floor until nothing is missing.

Optional Assemblies show a partial bought-Parts cost beside their upgrade-delta price. Their raw
material and labor remain Product-level, so the screen does not present that partial figure as a
full Assembly cost.
