# Post a stock adjustment

An adjustment moves a Part's stock without a Job behind it — a count correction, damage, scrap, or
the opening balance that puts a Part on the ledger for the first time. It appends a signed quantity
change: negative removes stock, positive adds it.

## Steps

1. Open **Inventory**.
2. Click **Post adjustment**.
3. Check **Operator**. It starts as you; choose whoever is doing the work if that is someone else.
4. Choose the **Part**.
5. Enter the **Signed quantity delta** — `10` adds ten, `-2` removes two.
6. For a linear Part, enter **Length (mm)** so the change lands in the right length bucket.
7. Choose the **Reason**:
   - **Opening balance** — putting a Part on the ledger for the first time
   - **Stock count** — a count correcting what the ledger believed
   - **Correction** — fixing a movement posted wrongly
   - **Damage**
   - **Scrap**
8. Write a **Note**. It is required for every reason except an opening balance.
9. Click **Post adjustment**.

A **Stock adjustment posted** toast confirms it.

## Notes

- An opening balance also asks for the opening cost, which is how a Part gets its first moving
  average — if you have cost access and the Part is not internally fabricated. Internally fabricated
  Parts carry no material cost to set. See [How stock costs work](./how-stock-costs-work.md).
- A periodic Part accepts only **Opening balance** and **Stock count**. Every other reason is
  rejected outright — see [Perpetual and periodic Parts](./perpetual-and-periodic-stock.md).
- Adjustments are how a count gets onto the ledger. They are not how material gets to a Job: use
  [Check out Parts](./check-out-parts-to-a-job.md) for that, so the Job or no-Job purpose carries the attribution.
- Nothing is ever edited or deleted. A wrong adjustment is corrected by another one, with
  **Correction** as its reason and a note saying which movement it answers.
