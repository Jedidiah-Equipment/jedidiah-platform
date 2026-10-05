import { jobCardFilename } from '@pkg/domain/contracting';
import type { JobCardVariant, JobSummary } from '@pkg/schema/contracting';
import { useCallback } from 'react';
import { FilePreviewSheet } from '@/components/file-preview/FilePreviewSheet.js';
import { jobCardUrl } from '@/contracting/lib/contracting-http-paths.js';

export const jobCardVariantLabels: Record<JobCardVariant, string> = {
  customer: 'Customer copy',
  internal: 'Internal copy',
};

type PreviewedJob = Pick<JobSummary, 'jobNumber' | 'updatedAt'>;

/** A Job Card in the shared file preview sheet; open while `job` is set. */
export function JobCardPreviewSheet({
  job,
  variant,
  onClose,
}: {
  job: PreviewedJob | null;
  variant: JobCardVariant;
  onClose: () => void;
}) {
  const jobNumber = job?.jobNumber ?? '';
  const fetchBlob = useCallback(
    async ({ signal }: { signal: AbortSignal }) => {
      const response = await fetch(jobCardUrl(jobNumber, variant), { signal, credentials: 'include' });
      if (!response.ok) throw new Error('Unable to preview the Job Card.');
      return response.blob();
    },
    [jobNumber, variant],
  );
  return (
    <FilePreviewSheet
      open={job !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      description={jobCardVariantLabels[variant]}
      downloadFilename={jobCardFilename(jobNumber, variant)}
      fetchBlob={fetchBlob}
      kind="pdf"
      queryKey={['job-card', jobNumber, variant, job?.updatedAt]}
      subject="Job Card"
      title={`${jobNumber} Job Card`}
    />
  );
}
