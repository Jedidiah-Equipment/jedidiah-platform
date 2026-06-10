import { departmentLabels, formatDate, hasPermission, JOB_DEPARTMENT_PIPELINE } from '@pkg/domain';
import {
  type AuthId,
  type Bay,
  type BayOperator,
  type Department,
  JobBayCreateInput,
  type JobBayOperatorAssignmentHistoryItem,
  JobBayRenameInput,
} from '@pkg/schema';
import { IconHistory, IconLoader2, IconPencil, IconPlus, IconUserMinus, IconUserOff } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DepartmentIcon } from '@/components/departments/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { baysPageDescription } from '@/utils/page-descriptions.js';

type CreateDialogState = {
  department: Department;
  name: string;
  operatorUserId: AuthId | null;
};

type EditDialogState = {
  bay: Bay;
  disabled: boolean;
  name: string;
  operatorUnassigned: boolean;
  operatorUserId: AuthId | null;
};

const jobDepartments = JOB_DEPARTMENT_PIPELINE.map((step) => step.department);

export const BaysPage: React.FC = () => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const access = accessQuery.data;
  const showMutationError = useApiMutationErrorToast();
  const { invalidateAudit, invalidateJobs } = useQueryInvalidation();

  const canManageBays = hasPermission(access, 'job_bay:update');
  const canReadBayHistory = hasPermission(access, 'job_bay:read');

  const baysQuery = useQuery(trpc.jobs.listJobBays.queryOptions({ filters: {} }));
  const operatorsQuery = useQuery({
    ...trpc.jobs.listBayOperators.queryOptions(),
    enabled: canManageBays,
  });
  const bays = baysQuery.data?.items ?? [];
  const operators = operatorsQuery.data?.operators ?? [];

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
  const assignBayOperatorMutation = useMutation(
    trpc.jobs.assignBayOperator.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to assign Bay Operator.'),
    }),
  );
  const unassignBayOperatorMutation = useMutation(
    trpc.jobs.unassignBayOperator.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to unassign Bay Operator.'),
    }),
  );

  const isEditPending =
    renameBayMutation.isPending ||
    setBayDisabledMutation.isPending ||
    assignBayOperatorMutation.isPending ||
    unassignBayOperatorMutation.isPending;
  const isCreatePending = createBayMutation.isPending || assignBayOperatorMutation.isPending;

  const createBay = async (state: CreateDialogState) => {
    const result = await createBayMutation.mutateAsync(
      JobBayCreateInput.parse({ department: state.department, name: state.name }),
    );

    if (state.operatorUserId) {
      await assignBayOperatorMutation.mutateAsync({
        bayId: result.bay.id,
        operatorUserId: state.operatorUserId,
      });
    }

    await refreshBayData();
    setCreateDialog(null);
    toast.success('Bay created');
  };

  const saveEdit = async (state: EditDialogState) => {
    const nextName = state.name.trim();
    const nameChanged = nextName !== state.bay.name;
    const disabledChanged = state.disabled !== Boolean(state.bay.disabledAt);
    const operatorUnassignChanged = Boolean(state.bay.currentOperator) && state.operatorUnassigned;
    const operatorAssignChanged =
      (!state.bay.currentOperator || state.operatorUnassigned) && state.operatorUserId !== null;
    const operatorChanged = operatorUnassignChanged || operatorAssignChanged;

    if (!nameChanged && !disabledChanged && !operatorChanged) {
      toast.info('No Bay changes to save');
      return;
    }

    if (nameChanged) {
      await renameBayMutation.mutateAsync(JobBayRenameInput.parse({ id: state.bay.id, name: nextName }));
    }

    if (disabledChanged) {
      await setBayDisabledMutation.mutateAsync({ disabled: state.disabled, id: state.bay.id });
    }

    if (operatorUnassignChanged) {
      await unassignBayOperatorMutation.mutateAsync({ bayId: state.bay.id });
    }

    if (operatorAssignChanged && state.operatorUserId) {
      await assignBayOperatorMutation.mutateAsync({ bayId: state.bay.id, operatorUserId: state.operatorUserId });
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
            <Button onClick={() => setCreateDialog({ department: 'fabrication', name: '', operatorUserId: null })}>
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
                          <div className="flex min-w-0 items-center gap-3">
                            <BayOperatorIndicator operator={bay.currentOperator} />
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
                          </div>
                          <CardAction span="header">
                            {canManageBays ? (
                              <Button
                                aria-label={`Edit ${bay.name}`}
                                onClick={() =>
                                  setEditDialog({
                                    bay,
                                    disabled: Boolean(bay.disabledAt),
                                    name: bay.name,
                                    operatorUnassigned: false,
                                    operatorUserId: null,
                                  })
                                }
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                              >
                                <IconPencil />
                              </Button>
                            ) : null}
                          </CardAction>
                        </CardHeader>
                        <BayOperatorHistory bayId={bay.id} enabled={canReadBayHistory} />
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
        isPending={isCreatePending}
        operators={operators}
        operatorsLoading={operatorsQuery.isLoading}
        onClose={() => setCreateDialog(null)}
        onSubmit={createBay}
        state={createDialog}
        onChange={setCreateDialog}
      />
      <EditBayDialog
        isPending={isEditPending}
        operators={operators}
        operatorsLoading={operatorsQuery.isLoading}
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
  operators: BayOperator[];
  operatorsLoading: boolean;
  onChange: (state: CreateDialogState | null) => void;
  onClose: () => void;
  onSubmit: (value: CreateDialogState) => Promise<unknown>;
};

const CreateBayDialog: React.FC<CreateBayDialogProps> = ({
  state,
  isPending,
  operators,
  operatorsLoading,
  onChange,
  onClose,
  onSubmit,
}) => {
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
              void onSubmit(state);
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
              <Field>
                <FieldLabel htmlFor="create-bay-operator">Current Operator</FieldLabel>
                <BayOperatorSelect
                  disabled={isPending}
                  id="create-bay-operator"
                  operators={operators}
                  operatorsLoading={operatorsLoading}
                  onValueChange={(operatorUserId) => onChange({ ...state, operatorUserId })}
                  value={state.operatorUserId}
                />
                {operatorsLoading || operators.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {operatorsLoading ? 'Loading Bay Operators.' : 'No Bay Operators available.'}
                  </p>
                ) : null}
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
  operators: BayOperator[];
  operatorsLoading: boolean;
  onChange: (state: EditDialogState | null) => void;
  onClose: () => void;
  onSubmit: (value: EditDialogState) => Promise<unknown>;
};

const EditBayDialog: React.FC<EditBayDialogProps> = ({
  state,
  isPending,
  operators,
  operatorsLoading,
  onChange,
  onClose,
  onSubmit,
}) => {
  const [localState, setLocalState] = useState<EditDialogState | null>(state);

  useEffect(() => {
    setLocalState(state);
  }, [state]);

  const canSubmit = Boolean(localState?.name.trim());
  const canAssignOperator = localState
    ? !localState.disabled && (!localState.bay.currentOperator || localState.operatorUnassigned) && operators.length > 0
    : false;
  const showOperatorPicker = localState
    ? !localState.disabled && (!localState.bay.currentOperator || localState.operatorUnassigned)
    : false;

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
                    const nextDisabled = checked === true;
                    const next = {
                      ...localState,
                      disabled: nextDisabled,
                      operatorUserId: nextDisabled ? null : localState.operatorUserId,
                    };
                    setLocalState(next);
                    onChange(next);
                  }}
                />
                <FieldContent>
                  <FieldLabel htmlFor="edit-bay-disabled">Disabled</FieldLabel>
                </FieldContent>
              </Field>
              {localState.bay.currentOperator && !localState.operatorUnassigned ? (
                <Field>
                  <FieldLabel>Current Operator</FieldLabel>
                  <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <OperatorIdentity operator={localState.bay.currentOperator} />
                    <Button
                      disabled={isPending}
                      onClick={() => {
                        const next = { ...localState, operatorUnassigned: true, operatorUserId: null };
                        setLocalState(next);
                        onChange(next);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <IconUserMinus data-icon="inline-start" />
                      Unassign
                    </Button>
                  </div>
                </Field>
              ) : showOperatorPicker ? (
                <Field>
                  <FieldLabel htmlFor="edit-bay-operator">Current Operator</FieldLabel>
                  <BayOperatorSelect
                    disabled={isPending}
                    id="edit-bay-operator"
                    operators={operators}
                    operatorsLoading={operatorsLoading}
                    onValueChange={(operatorUserId) => {
                      const next = { ...localState, operatorUserId };
                      setLocalState(next);
                      onChange(next);
                    }}
                    value={localState.operatorUserId}
                  />
                  {canAssignOperator ? null : (
                    <p className="text-muted-foreground text-xs">
                      {operatorsLoading ? 'Loading Bay Operators.' : 'No Bay Operators available.'}
                    </p>
                  )}
                </Field>
              ) : null}
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

type BayOperatorSelectProps = {
  disabled: boolean;
  id: string;
  operators: BayOperator[];
  operatorsLoading: boolean;
  value: AuthId | null;
  onValueChange: (operatorUserId: AuthId) => void;
};

const BayOperatorSelect: React.FC<BayOperatorSelectProps> = ({
  disabled,
  id,
  operators,
  operatorsLoading,
  value,
  onValueChange,
}) => {
  const selectedOperator = value ? (operators.find((operator) => operator.id === value) ?? null) : null;

  return (
    <Select
      disabled={disabled || operatorsLoading || operators.length === 0}
      onValueChange={(nextValue) => onValueChange(nextValue as AuthId)}
      value={value ?? undefined}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={operatorsLoading ? 'Loading Bay Operators...' : 'No Operator assigned'}>
          {selectedOperator?.name ?? null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          {operators.map((operator) => (
            <SelectItem key={operator.id} value={operator.id}>
              {operator.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

const BayOperatorIndicator: React.FC<{ operator: BayOperator | null }> = ({ operator }) => {
  if (!operator) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              aria-label="No Operator assigned"
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground"
              type="button"
            />
          }
        >
          <IconUserOff className="size-4" />
        </TooltipTrigger>
        <TooltipContent>No Operator assigned</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={`Current Operator: ${operator.name}`}
            className="flex shrink-0 rounded-md"
            type="button"
          />
        }
      >
        <EntityThumbnail label={operator.name} size="default" thumbnailDataUrl={operator.thumbnailDataUrl} />
      </TooltipTrigger>
      <TooltipContent>{operator.name}</TooltipContent>
    </Tooltip>
  );
};

const BayOperatorHistory: React.FC<{ bayId: Bay['id']; enabled: boolean }> = ({ bayId, enabled }) => {
  const trpc = useTRPC();
  const historyQuery = useQuery(trpc.jobs.listBayOperatorAssignmentHistory.queryOptions({ bayId }, { enabled }));

  if (!enabled) {
    return null;
  }

  if (historyQuery.isLoading) {
    return (
      <CardContent className="pt-0">
        <div className="space-y-2 border-t pt-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-full" />
        </div>
      </CardContent>
    );
  }

  if (historyQuery.error) {
    return (
      <CardContent className="pt-0">
        <p className="border-t pt-3 text-muted-foreground text-xs">Unable to load Operator history.</p>
      </CardContent>
    );
  }

  const history = historyQuery.data?.items ?? [];

  return (
    <CardContent className="pt-0">
      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <IconHistory className="size-3.5" />
          Operator History
        </div>
        {history.length > 0 ? (
          <div className="space-y-2">
            {history.map((item) => (
              <BayOperatorHistoryItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">No Operator history.</p>
        )}
      </div>
    </CardContent>
  );
};

const BayOperatorHistoryItem: React.FC<{ item: JobBayOperatorAssignmentHistoryItem }> = ({ item }) => (
  <div className="flex min-w-0 items-center gap-2">
    <EntityThumbnail label={item.operator.name} size="sm" thumbnailDataUrl={item.operator.thumbnailDataUrl} />
    <div className="min-w-0">
      <div className="truncate font-medium text-xs">{item.operator.name}</div>
      <div className="truncate text-muted-foreground text-xs">
        Assigned {formatDate(item.assignedAt, 'medium')} /{' '}
        {item.unassignedAt ? `Unassigned ${formatDate(item.unassignedAt, 'medium')}` : 'Current'}
      </div>
    </div>
  </div>
);

const OperatorIdentity: React.FC<{ operator: BayOperator }> = ({ operator }) => (
  <div className="min-w-0">
    <div className="truncate font-medium text-sm">{operator.name}</div>
    <div className="truncate text-muted-foreground text-xs">{operator.email}</div>
  </div>
);
