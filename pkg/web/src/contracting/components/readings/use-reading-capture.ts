import {
  CAPTURE_STEPS_START,
  type CaptureSteps,
  type CaptureWhen,
  capturedAtFor,
  confirmCaptureDate,
  deriveCaptureForm,
  parseCaptureValue,
  stepsAfterReadEarlier,
  stepsAfterRefusal,
  stepsAfterValueEdit,
  stepsAfterWhen,
} from '@pkg/domain/contracting';
import type { Assignment, ReadingCaptureInput } from '@pkg/schema/contracting';
import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingRefusal } from '@/contracting/lib/reading-refusal.js';
import { captureReading } from './capture-reading.js';
import { useLatestReading } from './use-latest-reading.js';
import { useReadAtEstimate } from './use-read-at-estimate.js';

const copy = {
  arrival: { failed: 'Unable to capture arrival reading.', done: 'Arrival reading captured' },
  departure: { failed: 'Unable to capture departure reading.', done: 'Departure reading captured' },
  spot: { failed: 'Unable to capture the reading.', done: 'Reading captured' },
} as const;

/** Where a capture lands: an Assignment's arrival or departure, or a spot reading on one Machine alone. */
export type CaptureTarget =
  | { role: 'arrival' | 'departure'; stint: Assignment | null }
  | { role: 'spot'; machineId: string };

/** The details step, which each dialog's form holds; the wizard holds the rest. */
export type CaptureDetails = { comment: string; stintOverrides: ReadingCaptureInput['stintOverrides'] };

const NO_DETAILS: CaptureDetails = { comment: '', stintOverrides: undefined };

/**
 * A capture dialog's wizard: the served latest, the hours and the estimate for them, the answers to each step, the
 * domain's verdict on all of it, and the submit that posts what that verdict built. `toDetails` is the dialog's one
 * mapping of its form onto the details step.
 */
export type ReadingCapture<TValues> = ReturnType<typeof useReadingCapture<TValues>>;

export function useReadingCapture<TValues>(target: CaptureTarget, toDetails: (values: TValues) => CaptureDetails) {
  const { role } = target;
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();
  const { stint, machineId } =
    target.role === 'spot'
      ? { stint: null, machineId: target.machineId }
      : { stint: target.stint, machineId: target.stint?.machineId ?? null };
  const latestQuery = useLatestReading(machineId);
  const [error, setError] = useState('');
  const [value, setValue] = useState('');
  const [steps, setSteps] = useState<CaptureSteps>(CAPTURE_STEPS_START);
  const estimateQuery = useReadAtEstimate(
    { machineId, role, assignmentId: stint?.id ?? null },
    parseCaptureValue(value),
  );
  const latest = latestQuery.isSuccess ? latestQuery.data : undefined;
  const judge = (details: CaptureDetails) =>
    deriveCaptureForm(
      { latest, now: new Date() },
      { role, value, estimate: estimateQuery.estimate, ...steps, ...details },
    );
  const verdict = judge(NO_DETAILS);
  return {
    latestQuery,
    /** The latest once loaded: null when the ledger is empty, undefined while loading or failed. */
    latest,
    estimateQuery,
    /** The wizard's steps as the domain judges them; the details are the form's, so `request` waits on `canSubmit`. */
    verdict,
    steps,
    value,
    error,
    chooseWhen: (when: CaptureWhen) => setSteps((current) => stepsAfterWhen(current, when)),
    editValue: (typed: string) => {
      setValue(typed);
      setSteps(stepsAfterValueEdit);
    },
    pickReadAt: (at: Date | null) => setSteps((current) => ({ ...current, pickedReadAt: at })),
    /** Under Today: the date line tapped, so its picker shows. */
    openDate: () => setSteps((current) => ({ ...current, dateOpened: true })),
    readEarlier: () => setSteps((current) => stepsAfterReadEarlier(current, estimateQuery.estimate)),
    dispute: (readingId: string | null) => setSteps((current) => ({ ...current, disputedReadingId: readingId })),
    confirmDate: () => setSteps((current) => ({ ...current, dateConfirmed: confirmCaptureDate(verdict) })),
    canSubmit: (values: TValues) => !!machineId && judge(toDetails(values)).request !== null,
    reset: () => {
      setError('');
      setValue('');
      setSteps(CAPTURE_STEPS_START);
    },
    /** Judges the values once more and posts what that judgement built, read at the date the person confirmed. */
    submit: async (values: TValues) => {
      const { request, date } = judge(toDetails(values));
      if (!machineId || !request) throw new Error('This reading cannot be captured yet.');
      setError('');
      try {
        await captureReading(
          {
            ...request,
            machineId,
            ...(stint ? { assignmentId: stint.id } : {}),
            capturedAt: capturedAtFor(date?.readAt ?? null, new Date()),
          },
          copy[role].failed,
        );
        // Any capture can dispute a stint's reading, which moves that Job's warnings.
        await Promise.all([invalidateJobs(), invalidateReadings()]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : copy[role].failed);
        setSteps((current) => stepsAfterRefusal(current, readingRefusal(cause).suggestedReadAt));
        // The ledger may have moved under the dialog: a newer latest re-judges the value and drops a stale dispute.
        void latestQuery.refetch();
        void estimateQuery.refetch();
        throw cause;
      }
      toast.success(copy[role].done);
    },
  };
}
