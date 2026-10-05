import { AI_VERDICT_POLL_LIMIT_MS, AI_VERDICT_POLL_MS } from '@pkg/domain/contracting';
import type { ReadingVerification } from '@pkg/schema/contracting';
import { useRef } from 'react';

type VerifiedReading = { id: string; aiVerification: ReadingVerification } | null | undefined;

/** The readings still waiting on their AI check, and since when the newest of them joined. */
export type PendingWindow = { ids: readonly string[]; since: number } | null;

const pendingIds = (readings: Iterable<VerifiedReading>) =>
  [...readings].flatMap((reading) => (reading?.aiVerification === 'pending' ? [reading.id] : []));

/**
 * Whether to ask again, and the window to keep. A reading that newly joins the pending set restarts the window, even
 * beside an older failed one; once the pending readings have waited past the limit they are failed checks waiting on
 * Re-verify, and polling stops.
 */
export function pollWindow(previous: PendingWindow, ids: readonly string[], now: number) {
  if (!ids.length) return { window: null, interval: false as const };
  const joined = !previous || ids.some((id) => !previous.ids.includes(id));
  const window = { ids, since: joined ? now : previous.since };
  return { window, interval: now - window.since < AI_VERDICT_POLL_LIMIT_MS ? AI_VERDICT_POLL_MS : (false as const) };
}

/** A query's `refetchInterval` that asks again every few seconds while a reading on screen awaits its AI check. */
export function useAiVerdictRefetchInterval<TData>(readingsOf: (data: TData) => Iterable<VerifiedReading>) {
  const pending = useRef<PendingWindow>(null);
  return (query: { state: { data: TData | undefined } }) => {
    const { data } = query.state;
    const next = pollWindow(pending.current, data === undefined ? [] : pendingIds(readingsOf(data)), Date.now());
    pending.current = next.window;
    return next.interval;
  };
}
