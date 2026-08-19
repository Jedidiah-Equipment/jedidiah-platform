# How stock costs work

Parts are costed on a moving average. Arrivals move it. Draws do not.

## The moving average

Stock arriving at a price is blended into what was already on hand, weighted by quantity. Four
movements arrive that way: a Receipt, a Return to Store, the units a build produces, and a Part's
opening balance.

Stock leaving does not move the average at all. A Checkout, or the components a build consumes, take
their quantity off at the average current at that moment — and that stamped figure is what the Job
carries, so returning it later comes back at the cost the Job actually drew rather than at whatever
the average has since drifted to.

A revaluation is the one movement that sets the average outright instead of blending into it. See
[Revalue a Part](./revalue-a-part.md).

For a linear Part the average is held per millimetre, so a 6 m length and a 300 mm offcut of the
same Part are valued consistently.

## "No cost yet" is not zero

A Part that has never had a cost established shows no cost at all, rather than a zero. The
difference matters: zero would quietly value the rack at nothing and drag every average that touched
it downward. Absent says the honest thing — nobody has told the system what this costs yet.

Internally fabricated Parts are the deliberate exception. They carry zero material cost, because
their raw material is charged separately and counting it twice would inflate the build.

## What a build costs

A build is value-preserving. It consumes each component at that component's stamped average and
produces the finished Part at consumed value ÷ units built. Nothing is created or destroyed in the
transaction — the value simply moves from the components to the thing they became. If nothing
consumed carried a cost, the finished units carry none either.

## Why you may not see costs

Cost visibility is gated. Without inventory cost access, every cost field reads as empty on every
screen that has one — the **Average cost** and **Value** columns are simply absent from the Stock on
hand table, and the **Unit cost override** field does not appear when receiving a delivery.

This is not a rendering fault and there is no toggle to find. The figures are withheld at the source
rather than hidden in the browser. If you need them, it is an access change, not a settings change.
