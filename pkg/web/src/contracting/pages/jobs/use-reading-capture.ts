import { useState } from 'react';
import { toast } from 'sonner';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { captureReading, type ReadingCaptureFields } from './capture-reading.js';

const copy = {
  arrival: { failed: 'Unable to capture arrival reading.', done: 'Arrival reading captured' },
  departure: { failed: 'Unable to capture departure reading.', done: 'Departure reading captured' },
} as const;

/** A capture dialog's meter photo, its refusal, and the submit that posts the reading. */
export function useReadingCapture(role: keyof typeof copy) {
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState('');
  return {
    photo,
    /** Spread onto `ReadingCaptureDetails`. */
    details: { photo, onPhotoChange: setPhoto, error, onError: setError },
    reset: () => {
      setPhoto(null);
      setError('');
    },
    submit: async (fields: Omit<ReadingCaptureFields, 'role' | 'capturedAt'>) => {
      setError('');
      try {
        await captureReading({ ...fields, role, capturedAt: new Date().toISOString() }, photo, copy[role].failed);
        await Promise.all([invalidateJobs(), invalidateReadings()]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : copy[role].failed);
        throw cause;
      }
      toast.success(copy[role].done);
    },
  };
}
