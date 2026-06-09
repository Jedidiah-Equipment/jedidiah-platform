import { departmentLabels, formatDate, hasPermission, JOB_DEPARTMENT_PIPELINE } from '@pkg/domain';
import { type Bay, type Department, JobBayCreateInput, JobBayRenameInput } from '@pkg/schema';
import { IconLoader2, IconPencil, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DepartmentIcon } from '@/components/departments/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardSeparator,
  CardTitle,
} from '@/components/ui/card.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Switch } from '@/components/ui/switch.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { baysPageDescription } from '@/utils/page-descriptions.js';

type CreateDialogState = {
  department: Department;
  name: string;
};

type EditDialogState = {
  bay: Bay;
  disabled: boolean;
  name: string;
};

const jobDepartments = JOB_DEPARTMENT_PIPELINE.map((step) => step.department);

export const BaysPage: React.FC = () => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const access = accessQuery.data;
  const showMutationError = useApiMutationErrorToast();
  const { invalidateAudit, invalidateJobs } = useQueryInvalidation();

  const canManageBays = hasPermission(access, 'job_bay:update');

  const baysQuery = useQuery(trpc.jobs.listJobBays.queryOptions({ filters: {} }));
  const bays = baysQuery.data?.items ?? [];

  const groupedBays = useMemo(
    () =>
      jobDepartments.map((department) => ({
        department,
        bays: bays.filter((bay) => bay.department === department),
      })),
    [bays],
  );

  const [createDialog, setCreateDialog] = useState<CreateDialogState | null>(null);
  const [editDialog, setEditDialog] = useState<EditDialogState | null>(null);

  const refreshBayData = async () => {
    await Promise.all([invalidateJobs(), invalidateAudit()]);
  };

  const createBayMutation = useMutation(
    trpc.jobs.createBay.mutationOptions({
      onSuccess: async () => {
        await refreshBayData();
        setCreateDialog(null);
        toast.success('Bay created');
      },
      onError: (error) => showMutationError(error, 'Unable to create Bay.'),
    }),
  );

  const renameBayMutation = useMutation(
    trpc.jobs.renameBay.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to rename Bay.'),
    }),
  );

  const setBayDisabledMutation = useMutation(
    trpc.jobs.setBayDisabled.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to update Bay status.'),
    }),
  );

  const isEditPending = renameBayMutation.isPending || setBayDisabledMutation.isPending;

  const saveEdit = async (state: EditDialogState) => {
    const nextName = state.name.trim();
    const nameChanged = nextName !== state.bay.name;
    const disabledChanged = state.disabled !== Boolean(state.bay.disabledAt);

    if (!nameChanged && !disabledChanged) {
      toast.info('No Bay changes to save');
      return;
    }

    if (nameChanged) {
      await renameBayMutation.mutateAsync(JobBayRenameInput.parse({ id: state.bay.id, name: nextName }));
    }

    if (disabledChanged) {
      await setBayDisabledMutation.mutateAsync({ disabled: state.disabled, id: state.bay.id });
    }

    await refreshBayData();
    setEditDialog(null);
    toast.success('Bay updated');
  };

  if (baysQuery.isLoading) {
    return (
      <PageLayout description={baysPageDescription} title="Bays">
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </PageLayout>
    );
  }

  if (baysQuery.error) {
    return (
      <PageLayout description={baysPageDescription} title="Bays">
        <ErrorMessage error={baysQuery.error} fallbackMessage="Unable to load Bays." />
      </PageLayout>
    );
  }

  return (
    <>
      <PageLayout
        actions={
          canManageBays ? (
            <Button onClick={() => setCreateDialog({ department: 'fabrication', name: '' })}>
              <IconPlus data-icon="inline-start" />
              New Bay
            </Button>
          ) : null
        }
        description={baysPageDescription}
        title="Bays"
        size="lg"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {groupedBays.map(({ department, bays }) => (
            <Card key={department}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DepartmentIcon className="size-4 text-muted-foreground" department={department} />
                  {departmentLabels[department]}
                </CardTitle>
              </CardHeader>
              <CardSeparator />
              <CardContent>
                {bays.length === 0 ? (
                  <Card size="sm">
                    <CardContent className="text-muted-foreground">No Bays configured.</CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3">
                    {bays.map((bay) => (
                      <Card key={bay.id} className="min-w-0" size="sm">
                        <CardHeader className="min-w-0 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto] gap-0">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <CardTitle className="truncate">{bay.name}</CardTitle>
                              {bay.disabledAt ? <Badge variant="outline">Disabled</Badge> : null}
                            </div>
                            <CardDescription className="text-xs">
                              Origin {formatDate(bay.scheduleOrigin, 'medium')}
                              {bay.disabledAt ? ` / Disabled ${formatDate(bay.disabledAt, 'medium')}` : ''}
                            </CardDescription>
                          </div>
                          {canManageBays ? (
                            <CardAction span="title">
                              <Button
                                aria-label={`Edit ${bay.name}`}
                                onClick={() =>
                                  setEditDialog({ bay, disabled: Boolean(bay.disabledAt), name: bay.name })
                                }
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                              >
                                <IconPencil />
                              </Button>
                            </CardAction>
                          ) : null}
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </PageLayout>

      <CreateBayDialog
        isPending={createBayMutation.isPending}
        onClose={() => setCreateDialog(null)}
        onSubmit={(value) => createBayMutation.mutateAsync(JobBayCreateInput.parse(value))}
        state={createDialog}
        onChange={setCreateDialog}
      />
      <EditBayDialog
        isPending={isEditPending}
        onClose={() => setEditDialog(null)}
        onSubmit={saveEdit}
        state={editDialog}
        onChange={setEditDialog}
      />
    </>
  );
};

type CreateBayDialogProps = {
  state: CreateDialogState | null;
  isPending: boolean;
  onChange: (state: CreateDialogState | null) => void;
  onClose: () => void;
  onSubmit: (value: CreateDialogState) => Promise<unknown>;
};

const CreateBayDialog: React.FC<CreateBayDialogProps> = ({ state, isPending, onChange, onClose, onSubmit }) => {
  const canSubmit = Boolean(state?.name.trim());

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={state !== null}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New Bay</DialogTitle>
          <DialogDescription>Create a durable Bay configuration.</DialogDescription>
        </DialogHeader>
        {state ? (
          <form
            id="create-bay-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit({ department: state.department, name: state.name });
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="create-bay-department">Department</FieldLabel>
                <Select
                  disabled={isPending}
                  onValueChange={(value) => onChange({ ...state, department: value as Department })}
                  value={state.department}
                >
                  <SelectTrigger id="create-bay-department" className="w-full">
                    <SelectValue>{departmentLabels[state.department]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start">
                    <SelectGroup>
                      {jobDepartments.map((department) => (
                        <SelectItem key={department} value={department}>
                          {departmentLabels[department]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="create-bay-name">Name</FieldLabel>
                <Input
                  disabled={isPending}
                  id="create-bay-name"
                  onChange={(event) => onChange({ ...state, name: event.currentTarget.value })}
                  value={state.name}
                />
              </Field>
            </FieldGroup>
          </form>
        ) : null}
        <DialogFooter>
          <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={isPending || !canSubmit} form="create-bay-form" type="submit">
            {isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            Create Bay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

type EditBayDialogProps = {
  state: EditDialogState | null;
  isPending: boolean;
  onChange: (state: EditDialogState | null) => void;
  onClose: () => void;
  onSubmit: (value: EditDialogState) => Promise<unknown>;
};

const EditBayDialog: React.FC<EditBayDialogProps> = ({ state, isPending, onChange, onClose, onSubmit }) => {
  const [localState, setLocalState] = useState<EditDialogState | null>(state);

  useEffect(() => {
    setLocalState(state);
  }, [state]);

  const canSubmit = Boolean(localState?.name.trim());

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={state !== null}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Bay</DialogTitle>
          <DialogDescription>{state ? departmentLabels[state.bay.department] : null}</DialogDescription>
        </DialogHeader>
        {localState ? (
          <form
            id="edit-bay-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit(localState);
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="edit-bay-name">Name</FieldLabel>
                <Input
                  disabled={isPending}
                  id="edit-bay-name"
                  onChange={(event) => {
                    const next = { ...localState, name: event.currentTarget.value };
                    setLocalState(next);
                    onChange(next);
                  }}
                  value={localState.name}
                />
              </Field>
              <Field orientation="horizontal">
                <Switch
                  checked={localState.disabled}
                  disabled={isPending}
                  id="edit-bay-disabled"
                  onCheckedChange={(checked) => {
                    const next = { ...localState, disabled: checked === true };
                    setLocalState(next);
                    onChange(next);
                  }}
                />
                <FieldContent>
                  <FieldLabel htmlFor="edit-bay-disabled">Disabled</FieldLabel>
                </FieldContent>
              </Field>
            </FieldGroup>
          </form>
        ) : null}
        <DialogFooter>
          <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={isPending || !canSubmit} form="edit-bay-form" type="submit">
            {isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            Save Bay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
