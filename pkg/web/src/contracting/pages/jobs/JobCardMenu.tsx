import { jobCardFilename } from '@pkg/domain/contracting';
import type { JobCardVariant, JobDetail } from '@pkg/schema/contracting';
import { IconChevronDown, IconFileText } from '@tabler/icons-react';
import { useCallback, useState } from 'react';
import { FilePreviewSheet } from '@/components/file-preview/FilePreviewSheet.js';
import { HelpLink } from '@/components/help/index.js';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { jobCardUrl } from '@/contracting/lib/contracting-http-paths.js';

const variantLabels: Record<JobCardVariant, string> = { customer: 'Customer copy', internal: 'Internal copy' };

/** Opens either Job Card variant in a new tab, where the browser prints it, or previews it beside the Job. */
export function JobCardMenu({ job }: { job: Pick<JobDetail, 'jobNumber' | 'updatedAt'> }) {
  const [preview, setPreview] = useState<JobCardVariant | null>(null);
  const variant = preview ?? 'customer';
  const fetchBlob = useCallback(
    async ({ signal }: { signal: AbortSignal }) => {
      const response = await fetch(jobCardUrl(job.jobNumber, variant), { signal, credentials: 'include' });
      if (!response.ok) throw new Error('Unable to preview the Job Card.');
      return response.blob();
    },
    [job.jobNumber, variant],
  );
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="outline" />}>
          <IconFileText data-icon="inline-start" />
          Job card
          <IconChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {(['customer', 'internal'] as const).map((item) => (
              <DropdownMenuItem
                key={item}
                render={<a href={jobCardUrl(job.jobNumber, item)} rel="noreferrer" target="_blank" />}
              >
                {variantLabels[item]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {(['customer', 'internal'] as const).map((item) => (
              <DropdownMenuItem key={item} onClick={() => setPreview(item)}>
                Preview {variantLabels[item].toLowerCase()}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <HelpLink label="How to print a Job Card" topic="contractingJobCard" />
      <FilePreviewSheet
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        description={variantLabels[variant]}
        downloadFilename={jobCardFilename(job.jobNumber, variant)}
        fetchBlob={fetchBlob}
        kind="pdf"
        queryKey={['job-card', job.jobNumber, variant, job.updatedAt]}
        subject="Job Card"
        title={`${job.jobNumber} Job Card`}
      />
    </>
  );
}
