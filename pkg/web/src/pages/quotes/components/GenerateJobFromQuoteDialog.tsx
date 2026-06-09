import { departmentLabels, hasPermission, JOB_DEPARTMENT_PIPELINE } from '@pkg/domain';
import { type Bay, JobCreateInput, type QuoteSummary } from '@pkg/schema';
import { IconBriefcase2, IconLoader2, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DepartmentIcon } from '@/components/departments/index.js';
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
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

type GenerateJobFromQuoteDialogProps = {
  className?: string;
  quote: Pick<QuoteSummary, 'code' | 'id' | 'linkedJobs' | 'status'>;
  size?: 'default' | 'icon-sm';
};

type BaySeedRow = {
  bayId: string;
  durationDays: string;
  key: string;
};

const jobDepartments = JOB_DEPARTMENT_PIPELINE.map((step) => step.department);

export const GenerateJobFromQuoteDialog: React.FC<GenerateJobFromQuoteDialogProps> = ({
  className,
  quote,
  size = 'default',
}) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateJobs, invalidateQuotes } = useQueryInvalidation();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const [isOpen, setIsOpen] = useState(false);
  const [baySeedRows, setBaySeedRows] = useState<BaySeedRow[]>([]);
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');
  const canGenerate = quote.status === 'accepted' && quote.linkedJobs.length === 0;
  const enabledBaysQuery = useQuery(
    trpc.jobs.listJobBays.queryOptions(
      { filters: { isDisabled: false } },
      { enabled: isOpen && canCreateJob && canGenerate },
    ),
  );
  const enabledBays = enabledBaysQuery.data?.items ?? [];
  const baysById = useMemo(() => new Map(enabledBays.map((bay) => [bay.id, bay])), [enabledBays]);
  const groupedBays = useMemo(
    () =>
      jobDepartments.map((department) => ({
        bays: enabledBays
          .filter((bay) => bay.department === department)
          .sort((left, right) => left.name.localeCompare(right.name)),
        department,
      })),
    [enabledBays],
  );
  const hasInvalidSeedRows = baySeedRows.some((row) => parsePositiveInteger(row.durationDays) === null);
  const createJobMutation = useMutation(
    trpc.jobs.create.mutationOptions({
      onSuccess: async (job) => {
        await Promise.all([invalidateJobs(), invalidateQuotes()]);
        toast.success('Job started');
        setIsOpen(false);
        setBaySeedRows([]);
        await navigate({ search: { job: job.id }, to: '/jobs' });
      },
      onError: (error) => showMutationError(error, 'Unable to start job.'),
    }),
  );
  const isPending = createJobMutation.isPending;
  const canSubmit = !isPending && !hasInvalidSeedRows;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);

    if (!open) {
      setBaySeedRows([]);
    }
  };

  const addBaySeedRow = (bay: Bay) => {
    setBaySeedRows((current) => [
      ...current,
      {
        bayId: bay.id,
        durationDays: '',
        key: globalThis.crypto.randomUUID(),
      },
    ]);
  };

  const updateBaySeedDuration = (key: string, durationDays: string) => {
    setBaySeedRows((current) => current.map((row) => (row.key === key ? { ...row, durationDays } : row)));
  };

  const removeBaySeedRow = (key: string) => {
    setBaySeedRows((current) => current.filter((row) => row.key !== key));
  };

  const submit = () => {
    if (!canSubmit) {
      return;
    }

    const baySeeds = baySeedRows.flatMap((row) => {
      const durationDays = parsePositiveInteger(row.durationDays);

      return durationDays === null ? [] : [{ bayId: row.bayId, durationDays }];
    });

    createJobMutation.mutate(JobCreateInput.parse({ baySeeds, quoteId: quote.id }));
  };

  if (!canCreateJob || !canGenerate) {
    return null;
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <DialogTrigger
        render={
          <Button
            aria-label={`Generate CFO and start job from quote ${quote.code}`}
            className={className}
            size={size}
            type="button"
            variant={size === 'icon-sm' ? 'outline' : 'default'}
          />
        }
      >
        <IconBriefcase2 data-icon={size === 'icon-sm' ? undefined : 'inline-start'} />
        {size === 'icon-sm' ? null : 'Generate CFO & Start Job'}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Generate CFO & Start Job</DialogTitle>
          <DialogDescription>
            Generate CFO and start Job, quote will be locked once the Job is created.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="font-medium text-sm">Bay seeds</p>
            {baySeedRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">No Bays selected.</p>
            ) : (
              <div className="divide-y rounded-md border border-border/70">
                {baySeedRows.map((row, index) => {
                  const bay = baysById.get(row.bayId);

                  return (
                    <div key={row.key} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                      <div className="min-w-0 self-center">
                        <p className="truncate font-medium">{bay?.name ?? 'Unavailable Bay'}</p>
                        <p className="text-muted-foreground text-xs">
                          {bay ? departmentLabels[bay.department] : 'Bay must be reselected'}
                        </p>
                      </div>
                      <Field className="gap-1">
                        <FieldLabel htmlFor={`job-bay-seed-duration-${row.key}`}>Days</FieldLabel>
                        <Input
                          disabled={isPending}
                          id={`job-bay-seed-duration-${row.key}`}
                          min={1}
                          onChange={(event) => updateBaySeedDuration(row.key, event.currentTarget.value)}
                          placeholder="1"
                          type="number"
                          value={row.durationDays}
                        />
                      </Field>
                      <Button
                        aria-label={`Remove Bay seed ${index + 1}`}
                        className="self-end"
                        disabled={isPending}
                        onClick={() => removeBaySeedRow(row.key)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <IconTrash />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="font-medium text-sm">Add Bay</p>
            {enabledBaysQuery.isLoading ? <Skeleton className="h-24" /> : null}
            {enabledBaysQuery.error ? (
              <ErrorMessage error={enabledBaysQuery.error} fallbackMessage="Unable to load Bays." />
            ) : null}
            {!enabledBaysQuery.isLoading && !enabledBaysQuery.error ? (
              <ScrollArea className="max-h-64 rounded-md border border-border/70">
                <div className="space-y-4 p-3">
                  {groupedBays.map(({ bays, department }) => (
                    <div key={department} className="space-y-2">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <DepartmentIcon className="size-3.5" department={department} />
                        <span>{departmentLabels[department]}</span>
                      </div>
                      {bays.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No enabled Bays.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {bays.map((bay) => (
                            <Button
                              disabled={isPending}
                              key={bay.id}
                              onClick={() => addBaySeedRow(bay)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <IconPlus data-icon="inline-start" />
                              {bay.name}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button disabled={isPending} type="button" variant="outline" />}>Cancel</DialogClose>
          <Button disabled={!canSubmit} onClick={submit} type="button">
            {isPending ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
            Generate CFO & Start Job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function parsePositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return parsed > 0 ? parsed : null;
}
