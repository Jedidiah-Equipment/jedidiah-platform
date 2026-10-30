import {
  capturedAtFor,
  captureValueVerdict,
  deriveCaptureForm,
  parseCaptureValue,
  READ_AT_NOW,
  type ReadAtChoice,
  readAtAfterRefusal,
  readAtAfterValueEdit,
  readAtEarlier,
  readAtOf,
  readAtPickedFromPicker,
} from '@pkg/domain/contracting';
import { UUID } from '@pkg/schema';
import { type Assignment, type ReadingCaptureInput, ReadingValue } from '@pkg/schema/contracting';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { z } from 'zod';
import { localDateTimeValue } from '@/components/form/utils/form-schema.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingRefusal } from '@/contracting/lib/reading-refusal.js';
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
  const [readAt, setReadAt] = useState<ReadAtChoice>(READ_AT_NOW);
  const readAtPicker = useRef<HTMLDivElement>(null);
  const latest = latestQuery.isSuccess ? latestQuery.data : undefined;
  const judge = (values: TValues) => {
    const draft = toDraft(values);
    return deriveCaptureForm(
      { latest, management, hasPhoto: photo !== null, now: new Date() },
      {
        role,
        value: Number.isFinite(draft.value) ? String(draft.value) : '',
        disputedReadingId: disputedReadingId(draft),
        comment: draft.comment,
        readAt,
        stintOverrides: draft.stintOverrides,
      },
    );
  };
  return {
    latestQuery,
    /** The latest once loaded: null when the ledger is empty, undefined while loading or failed. */
    latest,
    photo,
    judge,
    /** Whether the value is below the latest and its dispute confirmed: all the reading card needs. */
    judgeValue: (value: CaptureValue) =>
      captureValueVerdict(latest, parseFormValue(value.value), disputedReadingId(value), readAtOf(readAt)),
    /** Spread onto `ReadingCaptureDetails`. */
    details: { photo, onPhotoChange: setPhoto, error, onError: setError },
    /** When the meter was read; `readAtPicker` holds the picker Earlier… reveals. */
    readAt,
    readAtPicker,
    chooseNow: () => setReadAt(READ_AT_NOW),
    /** Earlier…, from the choice or the below-latest warning: reveals the picker and puts the person in it. */
    readEarlier: () => {
      flushSync(() => setReadAt(readAtEarlier));
      readAtPicker.current?.querySelector<HTMLElement>('button, input')?.focus();
    },
    /** What the picker now shows, which names no time until it is a whole one; the instant it still shows keeps its seconds. */
    pickReadAt: (value: string) =>
      setReadAt((current) => readAtPickedFromPicker(current, localDateTimeValue.safeParse(value).success ? value : '')),
    /** A new value: the Read At proposed for the refused one stays as the person's own time. */
    editValue: () => setReadAt(readAtAfterValueEdit),
    reset: () => {
      setPhoto(null);
      setError('');
      setReadAt(READ_AT_NOW);
    },
    /** Judges the values once more and posts what that judgement built, read when the Read At choice says. */
    submit: async (values: TValues) => {
      const { request } = judge(values);
      if (!machineId || !request) throw new Error('This reading cannot be captured yet.');
      setError('');
      try {
        await captureReading(
          {
            ...request,
            machineId,
            ...(stint ? { assignmentId: stint.id } : {}),
            capturedAt: capturedAtFor(readAtOf(readAt), new Date()),
          },
          photo,
          copy[role].failed,
        );
        // Any capture can dispute a stint's reading, which moves that Job's warnings.
        await Promise.all([invalidateJobs(), invalidateReadings()]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : copy[role].failed);
        setReadAt((current) => readAtAfterRefusal(current, readingRefusal(cause).suggestedReadAt));
        // The ledger may have moved under the dialog: a newer latest re-judges the value and drops a stale dispute.
        void latestQuery.refetch();
        throw cause;
      }
      toast.success(copy[role].done);
    },
  };
}
