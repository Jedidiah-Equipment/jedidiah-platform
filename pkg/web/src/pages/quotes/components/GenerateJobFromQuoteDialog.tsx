import { hasPermission } from '@pkg/domain';
import type { QuoteSummary } from '@pkg/schema';
import { IconBriefcase2, IconLoader2 } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

type GenerateJobFromQuoteDialogProps = {
  quote: Pick<QuoteSummary, 'code' | 'id' | 'linkedJobs' | 'status'>;
  size?: 'default' | 'icon-sm';
};

export const GenerateJobFromQuoteDialog: React.FC<GenerateJobFromQuoteDialogProps> = ({ quote, size = 'default' }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateJobs, invalidateQuotes } = useQueryInvalidation();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const [isOpen, setIsOpen] = useState(false);
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');
  const canGenerate = quote.status === 'accepted' && quote.linkedJobs.length === 0;
  const createJobMutation = useMutation(
    trpc.jobs.create.mutationOptions({
      onSuccess: async (job) => {
        await Promise.all([invalidateJobs(), invalidateQuotes()]);
        toast.success('Job started');
        setIsOpen(false);
        await navigate({ params: { id: job.id }, to: '/jobs/$id' });
      },
      onError: (error) => showMutationError(error, 'Unable to start job.'),
    }),
  );

  if (!canCreateJob || !canGenerate) {
    return null;
  }

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger
        render={
          <Button
            aria-label={`Generate CFO and start job from quote ${quote.code}`}
            size={size}
            type="button"
            variant={size === 'icon-sm' ? 'outline' : 'default'}
          />
        }
      >
        <IconBriefcase2 data-icon={size === 'icon-sm' ? undefined : 'inline-start'} />
        {size === 'icon-sm' ? null : 'Generate CFO & Start Job'}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate CFO & Start Job</DialogTitle>
          <DialogDescription>
            Generate CFO and start Job, quote will be locked once the Job is created.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button disabled={createJobMutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={createJobMutation.isPending}
            onClick={() => createJobMutation.mutate({ quoteId: quote.id })}
            type="button"
          >
            {createJobMutation.isPending ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
            Generate CFO & Start Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
