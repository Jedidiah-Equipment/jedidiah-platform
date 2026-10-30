import { capturedAtFor, captureValueVerdict, deriveCaptureForm, parseCaptureValue } from '@pkg/domain/contracting';
import { UUID } from '@pkg/schema';
import { type Assignment, ReadAtSuggestion, type ReadingCaptureInput, ReadingValue } from '@pkg/schema/contracting';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { MultipartRefusedError } from '@/contracting/lib/post-multipart.js';
import { useCan } from '@/hooks/use-access.js';
import { captureReading } from './capture-reading.js';
import { useLatestReading } from './use-latest-reading.js';

const copy = {
  arrival: { failed: 'Unable to capture arrival reading.', done: 'Arrival reading captured' },
  departure: { failed: 'Unable to capture departure reading.', done: 'Departure reading captured' },
  spot: { failed: 'Unable to capture the reading.', done: 'Reading captured' },
} as const;

/** Where a capture lands: an Assignment's arrival or departure, or a spot reading on one Machine alone. */
export type CaptureTarget =
  | { role: 'arrival' | 'departure'; stint: Assignment | null }
  | { role: 'spot'; machineId: string };

/** A dispute the person confirmed, tied to the value it was confirmed for: changing the value clears it. */
export const ConfirmedDispute = z.object({ value: ReadingValue, previousId: UUID }).nullable();
export type ConfirmedDispute = z.infer<typeof ConfirmedDispute>;

/** The reading half of every capture form: the value and the dispute confirmed for it. */
export type CaptureValue = { value: number; confirmedDispute: ConfirmedDispute };

/** What a capture dialog's values say, as the domain judges them; each dialog maps its own form onto it once. */
export type CaptureFormDraft = CaptureValue & {
  comment: string;
  /** When the meter was read; null is now. */
  readAt: Date | null;
  stintOverrides: ReadingCaptureInput['stintOverrides'];
};

const parseFormValue = (value: number) => (Number.isFinite(value) ? parseCaptureValue(String(value)) : null);
const disputedReadingId = ({ value, confirmedDispute }: CaptureValue) =>
  confirmedDispute?.value === value ? confirmedDispute.previousId : null;

/**
 * A capture dialog's served latest reading, its meter photo and refusal, the domain's judgement of its values, and the
 * submit that posts what that judgement built. `toDraft` is the dialog's one mapping of its form onto a capture.
 */
export type ReadingCapture<TValues> = ReturnType<typeof useReadingCapture<TValues>>;

export function useReadingCapture<TValues>(target: CaptureTarget, toDraft: (values: TValues) => CaptureFormDraft) {
  const { role } = target;
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();
  const { stint, machineId } =
    target.role === 'spot'
      ? { stint: null, machineId: target.machineId }
      : { stint: target.stint, machineId: target.stint?.machineId ?? null };
  const latestQuery = useLatestReading(machineId);
  const management = useCan('contracting_job:work-any').can;
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState('');
  // Earlier with no time picked yet holds Save back; the form's blank Read At is still "now".
  const [earlier, setEarlier] = useState(false);
  const [readAtFocus, setReadAtFocus] = useState(0);
  const [suggestion, setSuggestion] = useState<ReadAtSuggestion | null>(null);
  const latest = latestQuery.isSuccess ? latestQuery.data : undefined;
  const judgeDraft = (draft: CaptureFormDraft) => {
    const verdict = deriveCaptureForm(
      { latest, management, hasPhoto: photo !== null, now: new Date() },
      {
        role,
        value: Number.isFinite(draft.value) ? String(draft.value) : '',
        disputedReadingId: disputedReadingId(draft),
        comment: draft.comment,
        readAt: draft.readAt,
        stintOverrides: draft.stintOverrides,
      },
    );
    // Earlier… chosen but no time picked yet: nothing posts until there is one.
    const readAtPending = earlier && draft.readAt === null;
    return { ...verdict, readAtPending, request: readAtPending ? null : verdict.request };
  };
  return {
    latestQuery,
    /** The latest once loaded: null when the ledger is empty, undefined while loading or failed. */
    latest,
    photo,
    judge: (values: TValues) => judgeDraft(toDraft(values)),
    /** Whether the value is below the latest and its dispute confirmed: all the reading card needs. */
    judgeValue: (value: CaptureValue & { readAt: Date | null }) =>
      captureValueVerdict(latest, parseFormValue(value.value), disputedReadingId(value), value.readAt),
    /** Spread onto `ReadingCaptureDetails`. */
    details: { photo, onPhotoChange: setPhoto, error, onError: setError },
    /** The Read At choice: Earlier… once chosen, or once the server proposed a time. */
    earlier,
    readAtFocus,
    chooseEarlier: () => {
      setEarlier(true);
      setReadAtFocus((count) => count + 1);
    },
    chooseNow: () => {
      setEarlier(false);
      setSuggestion(null);
    },
    /** The Read At the server proposed for the last refused value; typing a new value drops it. */
    suggestion,
    clearSuggestion: () => setSuggestion(null),
    reset: () => {
      setPhoto(null);
      setError('');
      setEarlier(false);
      setSuggestion(null);
    },
    /** Judges the values once more and posts what that judgement built, read when the draft's Read At says. */
    submit: async (values: TValues) => {
      const draft = toDraft(values);
      const { request } = judgeDraft(draft);
      if (!machineId || !request) throw new Error('This reading cannot be captured yet.');
      setError('');
      try {
        await captureReading(
          {
            ...request,
            machineId,
            ...(stint ? { assignmentId: stint.id } : {}),
            capturedAt: capturedAtFor(draft.readAt, new Date()),
          },
          photo,
          copy[role].failed,
        );
        // Any capture can dispute a stint's reading, which moves that Job's warnings.
        await Promise.all([invalidateJobs(), invalidateReadings()]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : copy[role].failed);
        const proposed =
          cause instanceof MultipartRefusedError ? ReadAtSuggestion.safeParse(cause.data.suggestedReadAt) : null;
        if (proposed?.success) {
          setSuggestion(proposed.data);
          setEarlier(true);
        }
        // The ledger may have moved under the dialog: a newer latest re-judges the value and drops a stale dispute.
        void latestQuery.refetch();
        throw cause;
      }
      toast.success(copy[role].done);
    },
  };
}
