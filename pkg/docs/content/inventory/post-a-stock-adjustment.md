# Post a stock adjustment

An adjustment moves a Part's stock without a Job behind it — a count correction, damage, scrap, or
the opening balance that puts a Part on the ledger for the first time. It appends a signed quantity
change: negative removes stock, positive adds it.

## Steps

1. Open **Inventory**.
2. Click **Post adjustment**.
3. Choose the **Part**.
4. Enter the **Signed quantity delta** — `10` adds ten, `-2` removes two.
5. For a linear Part, enter **Length (mm)** so the change lands in the right length bucket.
6. Choose the **Reason**:
   - **Opening balance** — putting a Part on the ledger for the first time
   - **Stock count** — a count correcting what the ledger believed
   - **Correction** — fixing a movement posted wrongly
   - **Damage**
   - **Scrap**
7. Write a **Note**. It is required for every reason except an opening balance.
8. Click **Post adjustment**.

A **Stock adjustment posted** toast confirms it.

## Notes

- An opening balance with cost access also asks for the opening cost, which is how a Part gets its
  first moving average. See [How stock costs work](./how-stock-costs-work.md).
- A periodic Part accepts only **Opening balance** and **Stock count**. Every other reason is
  rejected outright — see [Perpetual and periodic Parts](./perpetual-and-periodic-stock.md).
- Adjustments are how a count gets onto the ledger. They are not how material gets to a Job: use
  [Check out Parts to a Job](./check-out-parts-to-a-job.md) for that, so the Job carries the cost.
- Nothing is ever edited or deleted. A wrong adjustment is corrected by another one, with
  **Correction** as its reason and a note saying which movement it answers.
