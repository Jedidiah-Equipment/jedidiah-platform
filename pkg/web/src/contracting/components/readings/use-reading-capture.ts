import {
  CAPTURE_STEPS_START,
  capturedAtFor,
  captureStepsReducer,
  deriveCaptureForm,
  parseCaptureValue,
} from '@pkg/domain/contracting';
import { useReducer, useState } from 'react';
import { toast } from 'sonner';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingRefusal } from '@/contracting/lib/reading-refusal.js';
import { captureReading } from './capture-reading.js';
import { useLatestReading } from './use-latest-reading.js';
import { useReadAtEstimate } from './use-read-at-estimate.js';

const FAILED = 'Unable to capture the reading.';

/** The details step, which the dialog's form holds; the wizard holds the rest. */
export type CaptureDetails = { comment: string };

const NO_DETAILS: CaptureDetails = { comment: '' };

/**
 * A spot capture dialog's wizard: the served latest, the hours and the estimate for them, the answers to each step,
 * the domain's verdict on all of it, and the submit that posts what that verdict built.
 */
export type ReadingCapture = ReturnType<typeof useReadingCapture>;

export function useReadingCapture(machineId: string) {
  const { invalidateReadings } = useQueryInvalidation();
  const latestQuery = useLatestReading(machineId);
  const [error, setError] = useState('');
  const [value, setValue] = useState('');
  const [steps, dispatch] = useReducer(captureStepsReducer, CAPTURE_STEPS_START);
  const estimateQuery = useReadAtEstimate(machineId, parseCaptureValue(value));
  const latest = latestQuery.isSuccess ? latestQuery.data : undefined;
  const judge = (details: CaptureDetails) =>
    deriveCaptureForm(
      { now: new Date() },
      { value, estimate: estimateQuery.estimate, ...steps, comment: details.comment },
    );
  const verdict = judge(NO_DETAILS);
  const canSubmit = (values: CaptureDetails) => judge(values).request !== null;
  /** Judges the values once more and posts what that judgement built, read at the date the person confirmed. */
  const submit = async (values: CaptureDetails) => {
    const { request, date } = judge(values);
    if (!request) throw new Error('This reading cannot be captured yet.');
    setError('');
    try {
      await captureReading(
        { ...request, machineId, capturedAt: capturedAtFor(date?.readAt ?? null, new Date()) },
        FAILED,
      );
      await invalidateReadings();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : FAILED);
      dispatch({ type: 'refused', proposal: readingRefusal(cause).suggestedReadAt });
      // The ledger may have moved under the dialog: a newer latest re-judges the value.
      void latestQuery.refetch();
      void estimateQuery.refetch();
      throw cause;
    }
    toast.success('Reading captured');
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
      onCreate: async (values: CaptureDetails) => {
        await submit(values);
        return true;
      },
    },
  };
}
