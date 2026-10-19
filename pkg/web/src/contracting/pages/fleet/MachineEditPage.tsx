import { hasPermission } from '@pkg/domain';
import type { Machine } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { QueryContent } from '@/components/common/QueryContent.js';
import { withCurrentOption } from '@/components/common/SearchableCombobox.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { useAutosaveForm } from '@/components/form/index.js';
import { DetailAsideGrid } from '@/components/page-layout/DetailAsideGrid.js';
import { EditFormFullWidth } from '@/components/page-layout/EditFormLayout.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { JobsTable } from '@/contracting/pages/jobs/JobsPage.js';
import { useAccess, useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { CategoryPickerField } from './CategoryFields.js';
import { FleetHistoryCard } from './FleetHistoryCard.js';
import { FleetRetirement } from './FleetRetirement.js';
import { MachineServiceCard } from './MachineServiceCard.js';
import { MachineEditTab, resolveMachineEditTab } from './machine-edit-tabs.js';
import { MachineFormValues, machineFormValues, machinePatchInput } from './types.js';

export function MachineEditPage({
  id,
  tab,
  onTabChange,
}: {
  id: string;
  tab: MachineEditTab;
  onTabChange: (tab: MachineEditTab) => void;
}) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingFleet.machines.get.queryOptions({ id }));
  return (
    <PageLayout
      title={
        query.data ? (
          <CategoryLabel
            icon={query.data.categoryIcon}
            colour={query.data.categoryColour}
            name={query.data.code}
            size={24}
          />
        ) : (
          'Machine'
        )
      }
      description={query.data ? `${query.data.categoryName} · Machine details` : 'Machine details'}
    >
      <QueryContent query={query} errorMessage="Unable to load machine.">
        {(machine) => <MachineForm key={id} machine={machine} tab={tab} onTabChange={onTabChange} />}
      </QueryContent>
    </PageLayout>
  );
}
function MachineForm({
  machine,
  tab,
  onTabChange,
}: {
  machine: Machine;
  tab: MachineEditTab;
  onTabChange: (tab: MachineEditTab) => void;
}) {
  const trpc = useTRPC();
  const { invalidateFleet } = useQueryInvalidation();
  const canEdit = useCan('contracting_machine:update').can && !machine.retiredAt;
  const readsServices = useCan('contracting_service:read').can;
  const access = useAccess().data;
  const readsJobs =
    hasPermission(access, 'contracting_job:read') || hasPermission(access, 'contracting_job:read-priced');
  const activeTab = resolveMachineEditTab(tab, { readsServices, readsJobs });
  const categories = useQuery(trpc.contractingFleet.categories.list.queryOptions({ kind: 'machine' }));
  const options = useQuery(trpc.contractingFleet.machines.options.queryOptions());
  const patch = useMutation(trpc.contractingFleet.machines.patch.mutationOptions({ onSuccess: invalidateFleet }));
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: machineFormValues(machine),
    failureMessage: 'Unable to update machine.',
    validator: MachineFormValues,
    toInput: (value) => machinePatchInput(machine.id, value),
    save: (value) => patch.mutateAsync(value),
  });
  const driverOptions = withCurrentOption(
    (options.data?.drivers ?? []).map((row) => ({ label: row.name, value: row.id })),
    machine.currentDriverUserId,
    machine.currentDriverName ?? 'Unavailable driver',
  );
  return (
    <>
      <ErrorMessage error={categories.error ?? options.error} fallbackMessage="Unable to load fleet options." />
      {machine.retiredAt ? <p className="mb-4 text-muted-foreground">Retired — {machine.retiredReason}</p> : null}
      <Tabs
        className="w-full"
        onValueChange={(value) => onTabChange(MachineEditTab.parse(value))}
        size="sm"
        value={activeTab}
      >
        <TabsList variant="default">
          <TabsTrigger value="details">Details</TabsTrigger>
          {readsServices ? <TabsTrigger value="service">Service</TabsTrigger> : null}
          {readsJobs ? <TabsTrigger value="jobs">Jobs</TabsTrigger> : null}
        </TabsList>
        <TabsContent className="pt-4" value="details">
          <DetailAsideGrid>
            <div className="min-w-0 space-y-5">
              <AutosaveFormCard formProps={formProps} autosave={autosave} disabled={!canEdit}>
                <form.AppField name="code">{(field) => <field.TextField label="Code" />}</form.AppField>
                <form.AppField name="categoryId">
                  {() => (
                    <CategoryPickerField
                      disabled={!canEdit}
                      categories={categories.data ?? []}
                      onValueCommit={autosave.commit}
                    />
                  )}
                </form.AppField>
                <form.AppField name="make">
                  {(field) => (
                    <field.CreatableComboboxField
                      label="Make"
                      disabled={!canEdit}
                      options={options.data?.makes ?? []}
                    />
                  )}
                </form.AppField>
                <form.AppField name="model">
                  {(field) => (
                    <field.CreatableComboboxField
                      label="Model"
                      disabled={!canEdit}
                      options={options.data?.models ?? []}
                    />
                  )}
                </form.AppField>
                <form.AppField name="year">{(field) => <field.NumberField label="Year" />}</form.AppField>
                <form.AppField name="registration">{(field) => <field.TextField label="Registration" />}</form.AppField>
                <form.AppField name="currentDriverUserId">
                  {(field) => (
                    <field.ComboboxField
                      label="Current driver"
                      disabled={!canEdit}
                      placeholder="Search drivers..."
                      emptyMessage="No drivers found."
                      options={[{ label: 'No driver', value: '' }, ...driverOptions]}
                      onValueCommit={autosave.commit}
                    />
                  )}
                </form.AppField>
                <form.AppField name="serviceIntervalHours">
                  {(field) => <field.NumberField label="Service interval" unit="hours" />}
                </form.AppField>
                <form.AppField name="nextServiceDueHours">
                  {(field) => <field.NumberField label="Next service due" unit="hours" />}
                </form.AppField>
                <EditFormFullWidth>
                  <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" />}</form.AppField>
                </EditFormFullWidth>
              </AutosaveFormCard>
              {canEdit ? (
                <FleetRetirement
                  machine={{
                    machineCode: machine.code,
                    categoryIcon: machine.categoryIcon,
                    categoryColour: machine.categoryColour,
                  }}
                  id={machine.id}
                  noun="machine"
                  autosave={autosave}
                  retire={trpc.contractingFleet.machines.retire.mutationOptions()}
                  remove={trpc.contractingFleet.machines.remove.mutationOptions()}
                />
              ) : null}
            </div>
            <FleetHistoryCard subject={{ machineId: machine.id }} onOpenService={() => onTabChange('service')} />
          </DetailAsideGrid>
        </TabsContent>
        {readsServices ? (
          <TabsContent className="pt-4" value="service">
            <MachineServiceCard machine={machine} />
          </TabsContent>
        ) : null}
        {readsJobs ? (
          <TabsContent className="pt-4" value="jobs">
            <JobsTable machineId={machine.id} />
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  );
}
