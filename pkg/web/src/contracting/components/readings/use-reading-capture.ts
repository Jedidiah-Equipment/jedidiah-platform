import {
  CAPTURE_STEPS_START,
  capturedAtFor,
  captureStepsReducer,
  deriveCaptureForm,
  parseCaptureValue,
} from '@pkg/domain/contracting';
import type { Assignment, ReadingCaptureInput } from '@pkg/schema/contracting';
import { useReducer, useState } from 'react';
import { toast } from 'sonner';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingRefusal } from '@/contracting/lib/reading-refusal.js';
import { getApiErrorAppCode } from '@/lib/api-errors.js';
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
export type CaptureDetails = { comment: string; stintOverrides?: ReadingCaptureInput['stintOverrides'] };

const NO_DETAILS: CaptureDetails = { comment: '' };

/**
 * A capture dialog's wizard: the served latest, the hours and the estimate for them, the answers to each step, the
 * domain's verdict on all of it, and the submit that posts what that verdict built. `toDetails` is the dialog's one
 * mapping of its form onto the details step; a form that already is the details needs none.
 */
export type ReadingCapture<TValues extends CaptureDetails> = ReturnType<typeof useReadingCapture<TValues>>;

export function useReadingCapture<TValues extends CaptureDetails>(
  target: CaptureTarget,
  toDetails: (values: TValues) => CaptureDetails = (values) => values,
) {
  const { role } = target;
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();
  const { stint, machineId } =
    target.role === 'spot'
      ? { stint: null, machineId: target.machineId }
      : { stint: target.stint, machineId: target.stint?.machineId ?? null };
  const latestQuery = useLatestReading(machineId);
  const [error, setError] = useState('');
  const [value, setValue] = useState('');
  const [steps, dispatch] = useReducer(captureStepsReducer, CAPTURE_STEPS_START);
  const estimateQuery = useReadAtEstimate(
    { machineId, role, assignmentId: stint?.id ?? null },
    parseCaptureValue(value),
  );
  const latest = latestQuery.isSuccess ? latestQuery.data : undefined;
  const judge = (details: CaptureDetails) =>
    deriveCaptureForm(
      { latest, now: new Date() },
      {
        role,
        value,
        estimate: estimateQuery.estimate,
        ...steps,
        comment: details.comment,
        stintOverrides: details.stintOverrides,
      },
    );
  const verdict = judge(NO_DETAILS);
  const canSubmit = (values: TValues) => !!machineId && judge(toDetails(values)).request !== null;
  /** Judges the values once more and posts what that judgement built, read at the date the person confirmed. */
  const submit = async (values: TValues) => {
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
      dispatch({ type: 'refused', code: getApiErrorAppCode(cause), proposal: readingRefusal(cause).suggestedReadAt });
      // The ledger may have moved under the dialog: a newer latest re-judges the value and drops a stale dispute.
      void latestQuery.refetch();
      void estimateQuery.refetch();
      throw cause;
    }
    toast.success(copy[role].done);
  };
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
    dispatch,
    editValue: (typed: string) => {
      setValue(typed);
      dispatch({ type: 'value-edited' });
    },
    canSubmit,
    reset: () => {
      setError('');
      setValue('');
      dispatch({ type: 'reset' });
    },
    submit,
    /** The `CreateEntityDialog` props every capture dialog shares: Save shows at the details step and posts the verdict's request. */
    dialogProps: {
      contentClassName: 'sm:max-w-md',
      submitLabel: 'Save reading',
      showSubmit: verdict.step === 'details',
      canSubmit,
      onBeforeCreate: canSubmit,
      onCreate: async (values: TValues) => {
        await submit(values);
        return true;
      },
    },
  };
}
