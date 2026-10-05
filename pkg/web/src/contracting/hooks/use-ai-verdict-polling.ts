import { AI_VERDICT_POLL_LIMIT_MS, AI_VERDICT_POLL_MS, awaitsAiVerdict } from '@pkg/domain/contracting';
import type { ReadingVerification } from '@pkg/schema/contracting';
import { useRef } from 'react';

type VerifiedReading = { aiVerification: ReadingVerification } | null | undefined;

/**
 * A query's `refetchInterval` that asks again every few seconds while a reading on screen awaits its AI check, so the
 * verdict appears as soon as it lands. It gives up once a check has been pending past the limit: that one failed and
 * waits on Re-verify.
 */
export function useAiVerdictRefetchInterval<TData>(readingsOf: (data: TData) => Iterable<VerifiedReading>) {
  const pendingSince = useRef<number | null>(null);
  return (query: { state: { data: TData | undefined } }) => {
    const { data } = query.state;
    if (data === undefined || !awaitsAiVerdict(readingsOf(data))) {
      pendingSince.current = null;
      return false;
    }
    pendingSince.current ??= Date.now();
    return Date.now() - pendingSince.current < AI_VERDICT_POLL_LIMIT_MS ? AI_VERDICT_POLL_MS : false;
  };
}
