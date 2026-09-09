# Maintain Labor rates

Administrators maintain the Labor Rate Card used to cost Product Labor Hours and seed new Quote Work Items.

1. Open **Admin → Labor rates**.
2. Select **Edit rates** to open the editing dialog. Enter the **Cost to company (R/hour)** and **Billing (R/hour)** for each work Department.
   Leave an unknown rate blank. A blank or zero cost-to-company rate leaves any Product Cost Estimate
   using that Department incomplete; a blank billing rate seeds new Work Items at zero.
3. Enter each Department's **Consumables (%)**, the **Management overhead (%)**, and
   **Hours per working day**. Percentages can exceed 100; hours per working day must be between 1 and 24.
   The current Product Cost Estimate uses hours × cost-to-company rate; the other settings do not yet affect its total.
4. Select **Save**. Product Cost Estimates immediately use the saved cost-to-company rates.
   Existing Quotes and Job Estimate Snapshots keep their saved prices and costs.
5. To trace a change, open **Audit** and filter to **Labor Rate Card**.
