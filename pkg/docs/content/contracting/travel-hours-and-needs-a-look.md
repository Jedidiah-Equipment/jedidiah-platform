# Travel Hours and needs a look

## Travel Hours

- Travel Hours are worked out when the Machine arrives: its arrival hours less its last departure hours on any Job.
- A Machine with no earlier departure, or one moved by truck, has 0 travel.
- When the arrival is below the Machine's last departure, Travel is set to 0 and the Machine is marked as needing a look.
- Editing the arrival works Travel out again, until management sets it by hand. Nothing recalculates Travel once it has been set by hand.
- Travel is billed at the Machine's rate.

## Needs a look

A Machine on a Job is marked amber when:

- Its Travel Hours are over the Travel Flag threshold in [Settings](./maintain-contracting-settings).
- Its Travel was set to 0 because the arrival was below the last departure.
- Its hours are further from John Deere's reading than the John Deere difference threshold.

Travel set by hand has been looked at, so it clears both Travel reasons. The marks show on the Machine, the Job Sheet, pricing and the internal Job Card, and the Jobs list and Dashboard count them. None of them stops the Job: the only thing that stops sign-off is a Machine still on site.
