import { formatDate, getFirstName } from '@pkg/domain';
import { machineServiceBadge, readingProviderSuffix, serviceRecordBadge } from '@pkg/domain/contracting';
import type { Machine, ServiceRecord } from '@pkg/schema/contracting';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { PrimaryLink } from '@/components/common/PrimaryLink.js';
import { QueryContent } from '@/components/common/QueryContent.js';
import { ReadOnlyField } from '@/components/form/index.js';
import { EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditFormLayout.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { hoursOrDash, machineHoursToService, NextServiceDue } from '@/contracting/components/MachineServiceDue.js';
import { StatusChip } from '@/contracting/components/StatusChip.js';
import { useTRPC } from '@/lib/trpc.js';
import { OpenServiceForm } from './OpenServiceForm.js';

const byFirstName = (name: string | null) => (name ? ` by ${getFirstName(name)}` : '');

function serviceRecordSummary(record: ServiceRecord) {
  if (record.status === 'closed')
    return `Closed ${formatDate(record.closedAt, 'short')}${byFirstName(record.closedByName)}`;
  const mechanic = record.mechanicName ? ` · ${getFirstName(record.mechanicName)}` : '';
  return `Booked in ${formatDate(record.startDate, 'short')}${mechanic}`;
}

/** One Service Record: editable while the Machine is in the workshop, read-only once the service is closed. */
export function ServiceRecordPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingServices.get.queryOptions({ id }));
  const record = query.data;
  return (
    <PageLayout
      title={
        record ? (
          <CategoryLabel
            icon={record.categoryIcon}
            colour={record.categoryColour}
            size={24}
            name={
              <span>
                <span className="font-mono font-semibold">{record.machineCode}</span> {record.categoryName}
              </span>
            }
          />
        ) : (
          'Service'
        )
      }
      description={record ? serviceRecordSummary(record) : undefined}
      actions={record ? <StatusChip {...serviceRecordBadge(record.status)} /> : null}
    >
      <QueryContent errorMessage="Unable to load the Service Record." query={query}>
        {(detail) => <ServiceRecordContent record={detail} />}
      </QueryContent>
    </PageLayout>
  );
}

function ServiceRecordContent({ record }: { record: ServiceRecord }) {
  const trpc = useTRPC();
  const machine = useQuery(trpc.contractingFleet.machines.get.queryOptions({ id: record.machineId }));
  return (
    <div className="space-y-5">
      <MachineCard machineId={record.machineId} query={machine} />
      {record.status === 'open' ? (
        <OpenServiceForm key={record.id} record={record} machineQuery={machine} />
      ) : (
        <ClosedServiceCard record={record} />
      )}
    </div>
  );
}

/** Where the Machine stands on service now, whatever this record says. */
function MachineCard({ machineId, query }: { machineId: string; query: UseQueryResult<Machine, unknown> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Machine</CardTitle>
        <CardAction>
          <PrimaryLink className="text-sm" to="/contracting/fleet/$id/edit" params={{ id: machineId }}>
            Open the Machine
          </PrimaryLink>
        </CardAction>
      </CardHeader>
      <CardContent>
        <QueryContent errorMessage="Unable to load the Machine." query={query}>
          {(machine) => (
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div className="space-y-1">
                <dt className="text-muted-foreground">
                  Current hours{readingProviderSuffix(machine.latestReadingProvider)}
                </dt>
                <dd>{hoursOrDash(machine.latestReadingHours)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-muted-foreground">Next service due</dt>
                <dd>
                  <NextServiceDue hours={machine.nextServiceDueHours} toGo={machineHoursToService(machine)} />
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-muted-foreground">Service</dt>
                <dd>
                  <StatusChip {...machineServiceBadge(machine)} />
                </dd>
              </div>
            </dl>
          )}
        </QueryContent>
      </CardContent>
    </Card>
  );
}

/** What the closed service recorded; the server refuses writes on it, so nothing here is editable. */
function ClosedServiceCard({ record }: { record: ServiceRecord }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Service</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <EditFormGrid>
          <ReadOnlyField label="Start date" value={formatDate(record.startDate, 'short')} />
          <ReadOnlyField label="End date" value={formatDate(record.endDate, 'short')} />
          <ReadOnlyField label="Reading at service" value={hoursOrDash(record.readingAtServiceHours)} />
          <ReadOnlyField
            label="Mechanic"
            value={
              record.mechanicName ? (
                getFirstName(record.mechanicName)
              ) : (
                <span className="text-muted-foreground">None</span>
              )
            }
          />
          <ReadOnlyField label="Next service due set" value={hoursOrDash(record.nextServiceDueHoursSet)} />
          <EditFormFullWidth>
            <ReadOnlyField
              label="Notes"
              value={record.notes}
              valueClassName="h-auto min-h-8 whitespace-pre-wrap py-1.5"
            />
          </EditFormFullWidth>
        </EditFormGrid>
        <p className="text-muted-foreground text-sm">
          Closed {formatDate(record.closedAt, 'medium')}
          {byFirstName(record.closedByName)}
        </p>
      </CardContent>
    </Card>
  );
}
