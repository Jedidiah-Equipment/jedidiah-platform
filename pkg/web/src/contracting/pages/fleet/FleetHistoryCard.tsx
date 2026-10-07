import { formatDate, formatHours } from '@pkg/domain';
import { breakdownStatusLabels, breakdownUrgencyLabels, readingRoleLabels } from '@pkg/domain/contracting';
import { breakdownStatuses } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { readingEvidence } from '@/contracting/components/ReadingEvidence.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

const historyKindLabels = { reading: 'Readings', breakdown: 'Breakdowns', service: 'Services' } as const;
type HistoryKind = keyof typeof historyKindLabels;
type HistoryRow = {
  id: string;
  kind: HistoryKind;
  kindLabel: string;
  /** An instant, or a plant date for a service; both sort as ISO strings. */
  at: string;
  summary: string;
  detail: string | null;
  /** The reading's photo and AI evidence, as the stint card labels it. */
  evidence?: string;
  breakdownId?: string;
};

const kindFilterOptions = Object.values(historyKindLabels).map((label) => ({ label, value: label }));

/** One newest-first timeline of what happened to a Machine or Implement: readings, Breakdowns and services. */
export function FleetHistoryCard({ subject }: { subject: { machineId: string } | { implementId: string } }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const machineId = 'machineId' in subject ? subject.machineId : null;
  const readsBreakdowns = useCan('contracting_breakdown:read').can;
  const readsServices = useCan('contracting_service:read').can && machineId !== null;
  const readings = useQuery(
    trpc.contractingReadings.listByMachine.queryOptions({ machineId: machineId ?? '' }, { enabled: !!machineId }),
  );
  const breakdowns = useQuery(
    trpc.contractingBreakdowns.list.queryOptions(
      { ...subject, statuses: [...breakdownStatuses], limit: 0 },
      { enabled: readsBreakdowns },
    ),
  );
  const services = useQuery(
    trpc.contractingServices.list.queryOptions({ machineId: machineId ?? '' }, { enabled: readsServices }),
  );
  const rows = useMemo<HistoryRow[]>(
    () =>
      [
        ...(readings.data ?? []).map((reading) => ({
          id: reading.id,
          kind: 'reading' as const,
          kindLabel: historyKindLabels.reading,
          at: reading.capturedAt,
          summary: `Reading · ${formatHours(reading.value)} · ${readingRoleLabels[reading.role]}`,
          detail: null,
          evidence: readingEvidence({ ...reading, photoBacked: reading.photo !== null }).evidenceLabel,
        })),
        ...(breakdowns.data?.items ?? []).map((breakdown) => ({
          id: breakdown.id,
          kind: 'breakdown' as const,
          kindLabel: historyKindLabels.breakdown,
          at: breakdown.reportedAt,
          summary: `Breakdown · ${breakdownUrgencyLabels[breakdown.urgency]} · ${breakdown.firstLine} · ${breakdownStatusLabels[breakdown.status]}`,
          detail: breakdown.jobNumber
            ? `${breakdown.jobNumber} · reported by ${breakdown.reporterName}`
            : `Reported by ${breakdown.reporterName}`,
          breakdownId: breakdown.id,
        })),
        ...(services.data ?? []).map((service) => ({
          id: service.id,
          kind: 'service' as const,
          kindLabel: historyKindLabels.service,
          at: service.endDate ?? service.startDate,
          summary: [
            'Service',
            service.readingAtServiceHours === null ? 'in the workshop' : formatHours(service.readingAtServiceHours),
            service.mechanicName,
          ]
            .filter(Boolean)
            .join(' · '),
          detail:
            service.nextServiceDueHoursSet === null
              ? null
              : `Next service due set to ${formatHours(service.nextServiceDueHoursSet)}`,
        })),
      ].sort((left, right) => right.at.localeCompare(left.at)),
    [readings.data, breakdowns.data, services.data],
  );
  const columns = useMemo<DataTableColumnDef<HistoryRow>[]>(
    () => [
      {
        accessorKey: 'at',
        header: 'When',
        enableGlobalFilter: false,
        // A service carries a plant date, not an instant, so it shows no time of day.
        cell: ({ row }) =>
          row.original.kind === 'service' ? (
            formatDate(row.original.at, 'short')
          ) : (
            <DateDisplay date={row.original.at} />
          ),
      },
      {
        accessorKey: 'kindLabel',
        header: 'Kind',
        enableColumnFilter: true,
        filterFn: 'equalsString',
        meta: { filterVariant: 'select', filterOptions: kindFilterOptions },
      },
      {
        accessorKey: 'summary',
        header: 'What happened',
        cell: ({ row }) => (
          <div className="min-w-48">
            <div className="font-medium">{row.original.summary}</div>
            {row.original.detail ? (
              <div className="mt-1 text-xs text-muted-foreground">{row.original.detail}</div>
            ) : null}
            {row.original.evidence ? (
              <Badge className="mt-1" variant="outline">
                {row.original.evidence}
              </Badge>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  );
  // An Implement has no readings or services, so without Breakdowns there is no history to show.
  if (!machineId && !readsBreakdowns) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent>
        <ErrorMessage
          error={readings.error ?? breakdowns.error ?? services.error}
          fallbackMessage="Unable to load history."
        />
        <ClientDataTable
          rows={rows}
          columns={columns}
          loading={
            (!!machineId && readings.isPending) ||
            (readsBreakdowns && breakdowns.isPending) ||
            (readsServices && services.isPending)
          }
          onOpen={(row) => {
            if (row.breakdownId) void navigate({ to: '/contracting/workshop/$id', params: { id: row.breakdownId } });
          }}
          emptyMessage="Nothing has happened to it yet."
          searchPlaceholder="Search history…"
          getRowId={(row) => `${row.kind}-${row.id}`}
        />
      </CardContent>
    </Card>
  );
}
