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
import { IconHistory, IconLoader2, IconPencil, IconPlus, IconUserMinus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BayOperatorIndicator } from '@/components/bays/index.js';
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

// What the user wants done to the Bay's operator on save. 'assign' on a Bay that already has an
// operator means unassign-then-assign, matching the API's two explicit steps.
type OperatorAction = { kind: 'keep' } | { kind: 'unassign' } | { kind: 'assign'; operatorUserId: AuthId };

const jobDepartments = JOB_DEPARTMENT_PIPELINE.map((step) => step.department);

export const BaysPage: React.FC = () => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const access = accessQuery.data;
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

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingBayId, setEditingBayId] = useState<string | null>(null);
  const [historyBay, setHistoryBay] = useState<Bay | null>(null);

  // Derived from the live query so a partial save never leaves the edit dialog showing stale state.
  const editingBay = editingBayId ? (bays.find((bay) => bay.id === editingBayId) ?? null) : null;

  const refreshBayData = async () => {
    await Promise.all([invalidateJobs(), invalidateAudit()]);
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
            <Button onClick={() => setCreateOpen(true)}>
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
                                Origin {formatDate(bay.scheduleOrigin, 'short')}
                                {bay.disabledAt ? ` / Disabled ${formatDate(bay.disabledAt, 'medium')}` : ''}
                              </CardDescription>
                            </div>
                          </div>
                          <CardAction className="flex items-center gap-1" span="header">
                            {canReadBayHistory ? (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      aria-label={`View Operator history for ${bay.name}`}
                                      onClick={() => setHistoryBay(bay)}
                                      size="icon-sm"
                                      type="button"
                                      variant="ghost"
                                    />
                                  }
                                >
                                  <IconHistory />
                                </TooltipTrigger>
                                <TooltipContent>Operator history</TooltipContent>
                              </Tooltip>
                            ) : null}
                            {canManageBays ? (
                              <Button
                                aria-label={`Edit ${bay.name}`}
                                onClick={() => setEditingBayId(bay.id)}
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                              >
                                <IconPencil />
                              </Button>
                            ) : null}
                          </CardAction>
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
        onClose={() => setCreateOpen(false)}
        onSaved={refreshBayData}
        open={isCreateOpen}
        operators={operators}
        operatorsLoading={operatorsQuery.isLoading}
      />
      <EditBayDialog
        bay={editingBay}
        onClose={() => setEditingBayId(null)}
        onSaved={refreshBayData}
        operators={operators}
        operatorsLoading={operatorsQuery.isLoading}
      />
      <BayOperatorHistoryDialog bay={historyBay} onClose={() => setHistoryBay(null)} />
    </>
  );
};

type CreateBayDialogProps = {
  open: boolean;
  operators: BayOperator[];
  operatorsLoading: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

const CreateBayDialog: React.FC<CreateBayDialogProps> = ({ open, operators, operatorsLoading, onClose, onSaved }) => (
  <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>New Bay</DialogTitle>
        <DialogDescription>Create a durable Bay configuration.</DialogDescription>
      </DialogHeader>
      {open ? (
        <CreateBayForm onClose={onClose} onSaved={onSaved} operators={operators} operatorsLoading={operatorsLoading} />
      ) : null}
    </DialogContent>
  </Dialog>
);

const CreateBayForm: React.FC<Omit<CreateBayDialogProps, 'open'>> = ({
  operators,
  operatorsLoading,
  onClose,
  onSaved,
}) => {
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();

  const [department, setDepartment] = useState<Department>('fabrication');
  const [name, setName] = useState('');
  const [operatorUserId, setOperatorUserId] = useState<AuthId | null>(null);

  const createBayMutation = useMutation(
    trpc.jobs.createBay.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to create Bay.'),
    }),
  );
  const assignBayOperatorMutation = useMutation(trpc.jobs.assignBayOperator.mutationOptions());

  const isPending = createBayMutation.isPending || assignBayOperatorMutation.isPending;
  const canSubmit = Boolean(name.trim());

  const submit = async () => {
    const result = await createBayMutation.mutateAsync(JobBayCreateInput.parse({ department, name }));

    // The Bay now exists, so never re-run the create on retry: report an assign failure and close.
    if (operatorUserId) {
      try {
        await assignBayOperatorMutation.mutateAsync({ bayId: result.bay.id, operatorUserId });
      } catch (error) {
        showMutationError(error, 'Bay created, but the Operator could not be assigned.');
        await onSaved();
        onClose();
        return;
      }
    }

    await onSaved();
    onClose();
    toast.success('Bay created');
  };

  return (
    <>
      <form
        id="create-bay-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit().catch(() => undefined);
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="create-bay-department">Department</FieldLabel>
            <Select
              disabled={isPending}
              onValueChange={(value) => setDepartment(value as Department)}
              value={department}
            >
              <SelectTrigger id="create-bay-department" className="w-full">
                <SelectValue>{departmentLabels[department]}</SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {jobDepartments.map((jobDepartment) => (
                    <SelectItem key={jobDepartment} value={jobDepartment}>
                      {departmentLabels[jobDepartment]}
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
              onChange={(event) => setName(event.currentTarget.value)}
              value={name}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="create-bay-operator">Current Operator</FieldLabel>
            <BayOperatorSelect
              disabled={isPending}
              id="create-bay-operator"
              operators={operators}
              operatorsLoading={operatorsLoading}
              onValueChange={setOperatorUserId}
              value={operatorUserId}
            />
            {operatorsLoading || operators.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {operatorsLoading ? 'Loading Bay Operators.' : 'No Bay Operators available.'}
              </p>
            ) : null}
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={isPending || !canSubmit} form="create-bay-form" type="submit">
          {isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
          Create Bay
        </Button>
      </DialogFooter>
    </>
  );
};

type EditBayDialogProps = {
  bay: Bay | null;
  operators: BayOperator[];
  operatorsLoading: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

const EditBayDialog: React.FC<EditBayDialogProps> = ({ bay, operators, operatorsLoading, onClose, onSaved }) => (
  <Dialog onOpenChange={(open) => !open && onClose()} open={bay !== null}>
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Edit Bay</DialogTitle>
        <DialogDescription>{bay ? departmentLabels[bay.department] : null}</DialogDescription>
      </DialogHeader>
      {bay ? (
        <EditBayForm
          bay={bay}
          key={bay.id}
          onClose={onClose}
          onSaved={onSaved}
          operators={operators}
          operatorsLoading={operatorsLoading}
        />
      ) : null}
    </DialogContent>
  </Dialog>
);

const EditBayForm: React.FC<Omit<EditBayDialogProps, 'bay'> & { bay: Bay }> = ({
  bay,
  operators,
  operatorsLoading,
  onClose,
  onSaved,
}) => {
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();

  const [name, setName] = useState<string>(bay.name);
  const [disabled, setDisabled] = useState(Boolean(bay.disabledAt));
  const [operatorAction, setOperatorAction] = useState<OperatorAction>({ kind: 'keep' });

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

  const isPending =
    renameBayMutation.isPending ||
    setBayDisabledMutation.isPending ||
    assignBayOperatorMutation.isPending ||
    unassignBayOperatorMutation.isPending;
  const canSubmit = Boolean(name.trim());

  const toggleDisabled = (nextDisabled: boolean) => {
    setDisabled(nextDisabled);

    // A Disabled Bay accepts no new assignments, so drop a pending assign (back to the unassign
    // intent it implied on an occupied Bay, or to no change at all).
    if (nextDisabled) {
      setOperatorAction((action) =>
        action.kind === 'assign' ? (bay.currentOperator ? { kind: 'unassign' } : { kind: 'keep' }) : action,
      );
    }
  };

  const save = async () => {
    const nextName = name.trim();
    const nameChanged = nextName !== bay.name;
    const disabledChanged = disabled !== Boolean(bay.disabledAt);
    const unassignNeeded = operatorAction.kind !== 'keep' && bay.currentOperator !== null;
    const assignNeeded = operatorAction.kind === 'assign';

    if (!nameChanged && !disabledChanged && !unassignNeeded && !assignNeeded) {
      toast.info('No Bay changes to save');
      return;
    }

    // Refresh even after a partial failure so the page and the derived `bay` prop stay honest.
    try {
      if (nameChanged) {
        await renameBayMutation.mutateAsync(JobBayRenameInput.parse({ id: bay.id, name: nextName }));
      }

      if (disabledChanged) {
        await setBayDisabledMutation.mutateAsync({ disabled, id: bay.id });
      }

      if (unassignNeeded) {
        await unassignBayOperatorMutation.mutateAsync({ bayId: bay.id });
      }

      if (operatorAction.kind === 'assign') {
        await assignBayOperatorMutation.mutateAsync({ bayId: bay.id, operatorUserId: operatorAction.operatorUserId });
      }

      onClose();
      toast.success('Bay updated');
    } finally {
      await onSaved();
    }
  };

  const showOperatorPicker = !disabled && (!bay.currentOperator || operatorAction.kind !== 'keep');

  return (
    <>
      <form
        id="edit-bay-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save().catch(() => undefined);
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="edit-bay-name">Name</FieldLabel>
            <Input
              disabled={isPending}
              id="edit-bay-name"
              onChange={(event) => setName(event.currentTarget.value)}
              value={name}
            />
          </Field>
          <Field orientation="horizontal">
            <Switch
              checked={disabled}
              disabled={isPending}
              id="edit-bay-disabled"
              onCheckedChange={(checked) => toggleDisabled(checked === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor="edit-bay-disabled">Disabled</FieldLabel>
            </FieldContent>
          </Field>
          {bay.currentOperator && operatorAction.kind === 'keep' ? (
            <Field>
              <FieldLabel>Current Operator</FieldLabel>
              <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2">
                <OperatorIdentity operator={bay.currentOperator} />
                <Button
                  disabled={isPending}
                  onClick={() => setOperatorAction({ kind: 'unassign' })}
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
                onValueChange={(operatorUserId) => setOperatorAction({ kind: 'assign', operatorUserId })}
                value={operatorAction.kind === 'assign' ? operatorAction.operatorUserId : null}
              />
              {operatorsLoading || operators.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  {operatorsLoading ? 'Loading Bay Operators.' : 'No Bay Operators available.'}
                </p>
              ) : null}
            </Field>
          ) : null}
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={isPending || !canSubmit} form="edit-bay-form" type="submit">
          {isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
          Save Bay
        </Button>
      </DialogFooter>
    </>
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

const BayOperatorHistoryDialog: React.FC<{ bay: Bay | null; onClose: () => void }> = ({ bay, onClose }) => (
  <Dialog onOpenChange={(open) => !open && onClose()} open={bay !== null}>
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Operator History</DialogTitle>
        <DialogDescription>{bay ? bay.name : null}</DialogDescription>
      </DialogHeader>
      {bay ? <BayOperatorHistoryList bayId={bay.id} /> : null}
    </DialogContent>
  </Dialog>
);

const BayOperatorHistoryList: React.FC<{ bayId: string }> = ({ bayId }) => {
  const trpc = useTRPC();
  const historyQuery = useQuery(trpc.jobs.listBayOperatorAssignmentHistory.queryOptions({ bayId }));

  const history = historyQuery.data?.items ?? [];

  return (
    <div className="space-y-3">
      {historyQuery.isLoading ? <BayOperatorHistorySkeleton /> : null}
      {historyQuery.error ? <p className="text-muted-foreground text-sm">Unable to load Operator history.</p> : null}
      {!historyQuery.isLoading && !historyQuery.error && history.length === 0 ? (
        <p className="text-muted-foreground text-sm">No Operator history.</p>
      ) : null}
      {history.length > 0 ? (
        <div className="space-y-2">
          {history.map((item) => (
            <BayOperatorHistoryItem key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const BayOperatorHistorySkeleton: React.FC = () => (
  <div className="space-y-2">
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
  </div>
);

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
