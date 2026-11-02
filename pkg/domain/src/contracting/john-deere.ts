import type { JohnDeerePollSummary } from '@pkg/schema/contracting';
import { countPhrase } from '../formatting/count-phrase.js';
import { formatNumber } from '../formatting/number.js';

/**
 * What every screen calls the telematics a Machine's hours are read through. Machines that are not John Deeres may
 * report through the John Deere Operations Center too, so the label names the system, not the make; the Connection
 * and its sign-in stay John Deere's.
 */
export const JD_LINK_LABEL = 'JD Link';

/** What Refresh now tells the person: how many machines it asked and what became of each. */
export function johnDeerePollMessage(summary: JohnDeerePollSummary): string {
  if (summary.skipped === 'not-connected') return 'John Deere is not connected, so nothing was read.';
  if (summary.skipped === 'no-links') return `No Machines are linked to ${JD_LINK_LABEL} yet.`;
  const results = [
    [summary.stored, countPhrase(summary.stored, 'new reading', 'new readings')],
    [summary.moved, `${formatNumber(summary.moved)} moved forward`],
    [summary.unchanged, `${formatNumber(summary.unchanged)} unchanged`],
    [summary.lost, `${formatNumber(summary.lost)} no longer listed by John Deere`],
    [summary.errors, countPhrase(summary.errors, 'failure', 'failures')],
  ].flatMap(([count, text]) => (count ? [text] : []));
  const polled = `Polled ${countPhrase(summary.polled, 'machine', 'machines')}${results.length ? `: ${results.join(', ')}` : ''}.`;
  return summary.endedBy ? `${polled} The run stopped early: ${summary.endedBy}` : polled;
}
