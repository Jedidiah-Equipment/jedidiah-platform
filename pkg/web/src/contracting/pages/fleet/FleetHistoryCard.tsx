import { formatDate, formatHours, getFirstName, type StatusBadgeColor } from '@pkg/domain';
import { breakdownStatusLabels, breakdownUrgencyLabels, readingRoleLabels } from '@pkg/domain/contracting';
import {
  type BreakdownStatus,
  type BreakdownUrgency,
  breakdownStatuses,
  type ReadingRole,
} from '@pkg/schema/contracting';
import { IconGauge, IconTool, type TablerIcon } from '@tabler/icons-react';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { ActivityEventTile } from '@/components/activity/ActivityEntries.js';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { ACTIVITY_EVENT_ICONS } from '@/contracting/components/activity/ActivityEntry.js';
import { BreakdownStatusBadge, BreakdownUrgencyIcon } from '@/contracting/components/BreakdownSubjectLabel.js';
import { readingEvidence } from '@/contracting/components/ReadingEvidence.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { historyKindColumn, historyKindLabels } from './history-kind-column.js';

type HistoryKind = keyof typeof historyKindLabels;
type HistoryRow = {
  id: string;
  kind: HistoryKind;
  kindLabel: string;
  /** An instant, or a plant date for a service; both sort as ISO strings. */
  at: string;
  searchText: string;
  title: string;
  detail: string | null;
  /** The reading's photo and AI evidence, as the stint card labels it. */
  evidence?: string;
  readingRole?: ReadingRole;
  breakdown?: { urgency: BreakdownUrgency; status: BreakdownStatus };
  opens: { to: 'breakdown'; id: string } | { to: 'job'; jobNumber: string } | { to: 'service' } | null;
};

const readingTiles: Partial<Record<ReadingRole, { icon: TablerIcon; tone: StatusBadgeColor }>> = {
  arrival: { icon: ACTIVITY_EVENT_ICONS['machine-arrived'], tone: 'blue' },
  departure: { icon: ACTIVITY_EVENT_ICONS['machine-left'], tone: 'gray' },
};
const otherReadingTile = { icon: IconGauge, tone: 'gray' } as const;
const serviceTile = { icon: IconTool, tone: 'green' } as const;

function HistoryWhatHappened({ row }: { row: HistoryRow }) {
  const icon = row.breakdown ? (
    <BreakdownUrgencyIcon urgency={row.breakdown.urgency} size={20} />
  ) : row.kind === 'service' ? (
    <ActivityEventTile {...serviceTile} />
  ) : (
    <ActivityEventTile {...((row.readingRole && readingTiles[row.readingRole]) ?? otherReadingTile)} />
  );
  return (
    <div className="flex min-w-48 items-center gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{row.title}</span>
          {row.breakdown ? <BreakdownStatusBadge status={row.breakdown.status} /> : null}
          {row.evidence ? <Badge variant="outline">{row.evidence}</Badge> : null}
        </div>
        {row.detail ? <div className="mt-1 text-xs text-muted-foreground">{row.detail}</div> : null}
      </div>
    </div>
  );
}

/** One newest-first timeline of what happened to a Machine or Implement: readings, Breakdowns and services. */
export function FleetHistoryCard({
  subject,
  onOpenService,
}: {
  subject: { machineId: string } | { implementId: string };
  /** A service row has no page of its own, so it opens the Machine's Service tab. */
  onOpenService?: () => void;
}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const machineId = 'machineId' in subject ? subject.machineId : null;
  const readsBreakdowns = useCan('contracting_breakdown:read').can;
  const readsServices = useCan('contracting_service:read').can && machineId !== null;
  const readings = useQuery(trpc.contractingReadings.listByMachine.queryOptions(machineId ? { machineId } : skipToken));
  const breakdowns = useQuery(
    trpc.contractingBreakdowns.list.queryOptions(
      {
        ...('machineId' in subject ? { machineIds: [subject.machineId] } : { implementIds: [subject.implementId] }),
        statuses: [...breakdownStatuses],
        limit: 0,
      },
      { enabled: readsBreakdowns },
    ),
  );
  const services = useQuery(
    trpc.contractingServices.list.queryOptions(readsServices && machineId ? { machineId } : skipToken),
  );
  const rows = useMemo<HistoryRow[]>(
    () =>
      [
        ...(readings.data ?? []).map((reading) => ({
          id: reading.id,
          kind: 'reading' as const,
          kindLabel: historyKindLabels.reading,
          at: reading.capturedAt,
          searchText: `Reading · ${formatHours(reading.value)} · ${readingRoleLabels[reading.role]} · ${reading.jobNumber ?? ''}`,
          title: `${readingRoleLabels[reading.role]} · ${formatHours(reading.value)}`,
          detail: reading.jobNumber,
          readingRole: reading.role,
          opens: reading.jobNumber ? { to: 'job' as const, jobNumber: reading.jobNumber } : null,
          evidence: readingEvidence({ ...reading, photoBacked: reading.photo !== null }).evidenceLabel,
        })),
        ...(breakdowns.data?.items ?? []).map((breakdown) => ({
          id: breakdown.id,
          kind: 'breakdown' as const,
          kindLabel: historyKindLabels.breakdown,
          at: breakdown.reportedAt,
          searchText: `Breakdown · ${breakdownUrgencyLabels[breakdown.urgency]} · ${breakdown.firstLine} · ${breakdownStatusLabels[breakdown.status]}`,
          title: breakdown.firstLine,
          detail: breakdown.jobNumber
            ? `${breakdown.jobNumber} · reported by ${getFirstName(breakdown.reporterName)}`
            : `Reported by ${getFirstName(breakdown.reporterName)}`,
          breakdown: { urgency: breakdown.urgency, status: breakdown.status },
          opens: { to: 'breakdown' as const, id: breakdown.id },
        })),
        ...(services.data ?? []).map((service) => {
          const title = [
            'Service',
            service.readingAtServiceHours === null ? 'in the workshop' : formatHours(service.readingAtServiceHours),
            service.mechanicName ? getFirstName(service.mechanicName) : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return {
            id: service.id,
            kind: 'service' as const,
            kindLabel: historyKindLabels.service,
            at: service.endDate ?? service.startDate,
            searchText: title,
            title,
            detail:
              service.nextServiceDueHoursSet === null
                ? null
                : `Next service due set to ${formatHours(service.nextServiceDueHoursSet)}`,
            opens: onOpenService ? { to: 'service' as const } : null,
          };
        }),
      ].sort((left, right) => right.at.localeCompare(left.at)),
    [readings.data, breakdowns.data, services.data, onOpenService],
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
      historyKindColumn({ isMachine: machineId !== null, readsBreakdowns, readsServices }),
      {
        accessorKey: 'searchText',
        header: 'What happened',
        cell: ({ row }) => <HistoryWhatHappened row={row.original} />,
      },
    ],
    [machineId, readsBreakdowns, readsServices],
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
          canOpen={(row) => row.opens !== null}
          onOpen={({ opens }) => {
            if (opens?.to === 'breakdown') void navigate({ to: '/contracting/workshop/$id', params: { id: opens.id } });
            else if (opens?.to === 'job')
              void navigate({ to: '/contracting/jobs/$code', params: { code: opens.jobNumber } });
            else if (opens?.to === 'service') onOpenService?.();
          }}
          emptyMessage="Nothing has happened to it yet."
          searchPlaceholder="Search history…"
          getRowId={(row) => `${row.kind}-${row.id}`}
        />
      </CardContent>
    </Card>
  );
}
