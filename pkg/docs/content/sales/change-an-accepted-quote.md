# Change an accepted Quote

Whether an accepted Quote can still be edited depends on whether it is **Locked**: a Locked Quote keeps the
prices and specification the Customer agreed to, so changing those means a new Quote.

## Which case you are in

- **A From Order Product Quote with no Job yet** is not Locked. Edit it like any other Quote.
- **A Product Quote that has started a Job** is Locked, even if that Job is completed or cancelled. While
  the Job is live or completed, follow [Re-quote a Quote that has a Job](#re-quote-a-quote-that-has-a-job).
- **A Product Quote whose Job was cancelled** has no Job to move. If the build is going ahead, click
  **Start Job** on it first: the replacement Job keeps the same machine while the Customer still owns it,
  and the re-quote steps then apply. If the sale is off, [cancel the Quote](/sales/cancel-a-quote) instead.
- **A From Stock Product Quote** locks the moment it is accepted. Its **Discount percent** can still change;
  for anything else, follow [Re-quote a From Stock Quote](#re-quote-a-from-stock-quote).
- **A Custom Quote** locks on acceptance, but its Work Items stay editable. Change the charge in place.

Every Locked Quote still accepts its **Invoice number**, internal and document notes, delivery dates, and
**Valid until**.

## Re-quote a Quote that has a Job

This needs an Administrator or Super Administrator. It moves the Job — and the machine it built — onto a new
Quote at today's prices, then retires the old Quote. The Job keeps its slots, stamps, stock and completion
date.

Do the steps in this order. Cancelling the old Quote while the Job is still on it offers to cancel the Job
and send its machine back to Stock.

1. Raise a new Quote for the same Customer and Product. Leave **Product Unit** on **Build to order**.
2. Select the Optional Assemblies, fill in the delivery dates, and check the **Quote total**. Prices come
   from the Product as it stands today.
3. Set **Status** to **Accepted**. Ignore the **Needs job** banner and do not click **Start Job**.
4. Click **Reassign Unit…**, pick the machine the old Quote's Job built, and click **Continue**. Check that
   the confirmation lists **Nothing** under both specification differences, add a reason, and click
   **Reassign Unit**. The Job now shows on the new Quote, which is Locked from here on.
5. Open the old Quote and click **Cancel Quote**. The confirmation should ask only for a reason. If it offers
   to cancel a Job or remove a Unit, step 4 did not go through: click **Keep quote** and go back to it.
6. Type a reason that names the new Quote, and click **Cancel Quote**.
7. On the new Quote, fill in the **Invoice number** and carry over any notes.

Once the old Quote has an **Invoice number**, its machine can no longer move, and this procedure is refused.
See [Reassign a Unit](/sales/reassign-a-unit) for the other rules.

When both Quotes are for the same Customer, the machine's ownership history still names the old Quote
against the original sale. Ownership never changed hands, so no new Transfer is recorded.

## Re-quote a From Stock Quote

For a From Stock Quote that has not started a Rework Job:

1. Open the Quote, click **Cancel Quote**, give a reason, and confirm. The machine goes back to Stock.
2. Raise a new Quote for the same Customer and Product, and pick the same machine under **Product Unit**.
3. Make the changes, then set **Status** to **Accepted**. The machine moves to the Customer again.
