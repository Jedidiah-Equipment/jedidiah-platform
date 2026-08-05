# Print Part Labels

A Part Label is a printable identity for one Part: a barcode of the Part code, plus readable text
repeating the code, the name, and the Storage Location. Labels are printed on demand and are never
stored or tracked — print another whenever one goes missing or a location changes.

## One Part

From the **Parts** list, or from a Purchase Order's **Receiving** card once a line has received
something:

1. Click **Print label** on the Part's row.
2. The label opens in a new browser tab.
3. Print it from there.

On a Purchase Order the button only appears once the line has received something, so labels follow
stock that has actually landed.

## A batch

1. Open **Parts**.
2. Click **Print labels**.
3. Under **Parts to label**, choose the set:
   - **All Parts**
   - **By category**
   - **By storage location**
   - **Choose Parts** — pick them individually
4. Fill in the category or storage location if the mode asks for one. **Open printable PDF** stays
   disabled until the selection is complete.
5. Click **Open printable PDF** and print the sheet from the tab that opens.

## A stores badge card

A badge card is the same label stock carrying a person's name and a barcode the stores tablet reads
to switch to them. Only users with the **Stores** role have one.

1. Open **Users** and click the person.
2. Click **Print stores badge**.
3. Print it from the tab that opens.

The tablet itself has no badge. It is a **Device Account** — a record for a shared machine rather
than a person — so it can never be the name on a movement, and the button is not offered for it. An
admin marks an account one with **Shared device** on the user, alongside the role.

The card identifies; it does not sign anyone in. Anyone holding it can post stock under that name, so
treat it like a name badge, not a key. Reprint whenever one is lost, and change the person's role
away from Stores when they should no longer be posting — the tablet then refuses the old card.

See [Work the stores tablet](./work-the-stores-tablet.md).

## Notes

- The barcode encodes only the Part code. Nothing about quantity, length, Job, or Supplier is in it.
- Labels are never scoped by Supplier — one Part, one label, whoever supplied it.
- A linear Part gets one label per Part, not one per length. Length lives on the movement, not on the
  identity of the Part.
- Reprint after changing a Part's Storage Location. The old label still scans, but its readable text
  will send someone to the wrong rack.
