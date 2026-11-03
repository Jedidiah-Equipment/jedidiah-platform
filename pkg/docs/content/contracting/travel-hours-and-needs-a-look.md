# Travel Hours and needs a look

## Travel Hours

- Travel Hours are worked out when the Machine arrives: its arrival hours less the highest departure hours at or below that arrival on any Job.
- Because Travel goes by the hours and not by when they were captured, loading an old Job after the fact works out its Travel from the departures before it, and leaves the Travel of later Jobs alone.
- A Machine with no departure at or below the arrival, or one moved by truck, has 0 travel.
- Editing the arrival works Travel out again, until management sets it by hand. Nothing recalculates Travel once it has been set by hand.
- Travel is billed at the Machine's rate.

## Needs a look

A Machine on a Job is marked amber when:

- Its Travel Hours are over the Travel Flag threshold in [Settings](./maintain-contracting-settings).
- Its hours are further from JD Link's reading than the JD Link difference threshold.

Travel set by hand has been looked at, so it clears the Travel reason. The marks show on the Machine, the Job Sheet, pricing and the internal Job Card, and the Jobs list and Dashboard count them. None of them stops the Job: the only thing that stops sign-off is a Machine still on site.

## Dismissed reasons

A reason can be right as it stands: the Machine really did travel that far, or JD Link's last report is old. Management then dismisses it, once, for everyone on the web and the phone. A dismissed reason stays on the Machine, faded, with who dismissed it; it no longer marks the Machine amber, and the Jobs list and Dashboard stop counting it. It comes back by itself when the hours or Travel it is about change. Foremen see reasons but cannot dismiss them.
