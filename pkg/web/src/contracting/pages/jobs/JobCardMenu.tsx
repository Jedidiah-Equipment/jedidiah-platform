import type { JobCardVariant, JobDetail } from '@pkg/schema/contracting';
import { IconChevronDown, IconFileText } from '@tabler/icons-react';
import { useState } from 'react';
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
import { JobCardPreviewSheet, jobCardVariantLabels as variantLabels } from './JobCardPreviewSheet.js';

/** Opens either Job Card variant in a new tab, where the browser prints it, or previews it beside the Job. */
export function JobCardMenu({ job }: { job: Pick<JobDetail, 'jobNumber' | 'updatedAt'> }) {
  const [preview, setPreview] = useState<JobCardVariant | null>(null);
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
      <JobCardPreviewSheet
        job={preview ? job : null}
        variant={preview ?? 'customer'}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
