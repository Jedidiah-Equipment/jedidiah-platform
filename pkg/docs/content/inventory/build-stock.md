# Build stock

A build turns components into finished units of a Built Part — a Part made in-house, which carries a
BOM instead of a Supplier. It is one transaction: the components come off the rack and the finished
units go on.

## Steps

1. Open **Inventory**.
2. Click **Build stock**.
3. Choose the **Built Part**. Only Built Parts tracked perpetually appear in the list.
4. Enter **Units built** — how many finished units came off the rack.
5. Check the consumption rows. They prefill at BOM quantity × units built. Edit them to what
   actually left the rack.
6. Click **Post build**.

## If it warns you

Changing a consumption row away from its BOM figure raises *This differs from what the BOM calls
for.*, and the button becomes **Build anyway**. Post it — the build already happened, and the BOM is
what you expected it to take, not a record of what it took. A short rack going negative is likewise
recorded rather than blocked.

See [Warnings are judgments, not blocks](./warnings-are-judgments.md).

## Notes

- **Builds never recurse.** If a component is itself a Built Part, build that batch to the rack
  first, then build the outer Part. The build only ever consumes what is on the rack.
- Raw material posts no consumption at all — it is not stocked as a component.
- An empty BOM is legal. That is the trivial build of a Part whose components are all raw material.
- Cost moves with the material rather than being invented: see
  [How stock costs work](./how-stock-costs-work.md).
