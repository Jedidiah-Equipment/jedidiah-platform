import { capturedAtFor, deriveCaptureForm } from '@pkg/domain/contracting';
import { UUID } from '@pkg/schema';
import { type Assignment, type ReadingCaptureInput, ReadingValue } from '@pkg/schema/contracting';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { captureReading } from './capture-reading.js';
import { useLatestReading } from './use-latest-reading.js';

const copy = {
  arrival: { failed: 'Unable to capture arrival reading.', done: 'Arrival reading captured' },
  departure: { failed: 'Unable to capture departure reading.', done: 'Departure reading captured' },
  spot: { failed: 'Unable to capture the reading.', done: 'Reading captured' },
} as const;

/** Where a capture lands: an Assignment's arrival or departure, or a spot reading on the Machine alone. */
export type CaptureTarget =
  | { role: 'arrival' | 'departure'; stint: Assignment | null }
  | { role: 'spot'; machineId: string | null };

/** A dispute the person confirmed, tied to the value it was confirmed for: changing the value clears it. */
export const ConfirmedDispute = z.object({ value: ReadingValue, previousId: UUID }).nullable();
export type ConfirmedDispute = z.infer<typeof ConfirmedDispute>;

/** What a capture dialog's form holds, as the shared form brain reads it. */
export type CaptureFormValues = {
  value: number;
  comment: string;
  confirmedDispute: ConfirmedDispute;
  stintOverrides?: ReadingCaptureInput['stintOverrides'];
  /** When the meter was read; null or absent is now. */
  readAt?: Date | null;
};

/**
 * A capture dialog's served latest reading, its meter photo and refusal, the domain's judgement of the form, and
 * the submit that posts the request that judgement built.
 */
export type ReadingCapture = ReturnType<typeof useReadingCapture>;

export function useReadingCapture(target: CaptureTarget) {
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
  const latest = latestQuery.isSuccess ? latestQuery.data : undefined;
  const judge = (values: CaptureFormValues) =>
    deriveCaptureForm(
      { latest, management, hasPhoto: photo !== null, now: new Date() },
      {
        role,
        value: Number.isFinite(values.value) ? String(values.value) : '',
        disputedReadingId: values.confirmedDispute?.value === values.value ? values.confirmedDispute.previousId : null,
        comment: values.comment,
        readAt: values.readAt ?? null,
        stintOverrides: values.stintOverrides,
      },
    );
  return {
    latestQuery,
    /** The latest once loaded: null when the ledger is empty, undefined while loading or failed. */
    latest,
    photo,
    judge,
    /** Spread onto `ReadingCaptureDetails`. */
    details: { photo, onPhotoChange: setPhoto, error, onError: setError },
    reset: () => {
      setPhoto(null);
      setError('');
    },
    /** Judges the values once more and posts what that judgement built, read when `values.readAt` says. */
    submit: async (values: CaptureFormValues) => {
      const { request } = judge(values);
      if (!machineId || !request) throw new Error('This reading cannot be captured yet.');
      setError('');
      try {
        await captureReading(
          {
            ...request,
            machineId,
            ...(stint ? { assignmentId: stint.id } : {}),
            capturedAt: capturedAtFor(values.readAt ?? null, new Date()),
          },
          photo,
          copy[role].failed,
        );
        // Any capture can dispute a stint's reading, which moves that Job's warnings.
        await Promise.all([invalidateJobs(), invalidateReadings()]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : copy[role].failed);
        // The ledger may have moved under the dialog: a newer latest re-judges the value and drops a stale dispute.
        void latestQuery.refetch();
        throw cause;
      }
      toast.success(copy[role].done);
    },
  };
}
