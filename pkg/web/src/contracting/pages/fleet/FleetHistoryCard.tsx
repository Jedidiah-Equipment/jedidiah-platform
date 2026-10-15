import { formatDate, formatHours, getFirstName, type StatusBadgeColor, statusBadgeColorClassNames } from '@pkg/domain';
import { breakdownStatusLabels, breakdownUrgencyLabels, readingRoleLabels } from '@pkg/domain/contracting';
import {
  type BreakdownStatus,
  type BreakdownUrgency,
  breakdownStatuses,
  type ReadingRole,
} from '@pkg/schema/contracting';
import { IconArrowBarToDown, IconArrowBarUp, IconGauge, IconTool, type TablerIcon } from '@tabler/icons-react';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { BreakdownStatusBadge, BreakdownUrgencyIcon } from '@/contracting/components/BreakdownSubjectLabel.js';
import { readingEvidence } from '@/contracting/components/ReadingEvidence.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { historyKindColumn, historyKindLabels } from './history-kind-column.js';

type HistoryKind = keyof typeof historyKindLabels;
type HistoryRow = {
  id: string;
  kind: HistoryKind;
  kindLabel: string;
  /** An instant, or a plant date for a service; both sort as ISO strings. */
  at: string;
  /** What the row says, as plain text for search; the cell draws it with the record's own icons and badges. */
  summary: string;
  title: string;
  detail: string | null;
  /** The reading's photo and AI evidence, as the stint card labels it. */
  evidence?: string;
  readingRole?: ReadingRole;
  /** The Job whose stint the reading opened or closed; the row opens it. */
  jobNumber?: string;
  breakdown?: { id: string; urgency: BreakdownUrgency; status: BreakdownStatus };
};

/** Readings and services draw the tiles Activity gives the same events; a Breakdown draws its urgency flag. */
const readingTiles: Partial<Record<ReadingRole, { icon: TablerIcon; tone: StatusBadgeColor }>> = {
  arrival: { icon: IconArrowBarToDown, tone: 'blue' },
  departure: { icon: IconArrowBarUp, tone: 'gray' },
};
const otherReadingTile = { icon: IconGauge, tone: 'gray' } as const;
const serviceTile = { icon: IconTool, tone: 'green' } as const;

function HistoryTile({ icon: Icon, tone }: { icon: TablerIcon; tone: StatusBadgeColor }) {
  const colours = statusBadgeColorClassNames[tone];
  return (
    <span
      className={cn(
        'inline-flex size-[26px] shrink-0 items-center justify-center rounded-md border',
        colours.chip,
        colours.text,
      )}
    >
      <Icon aria-hidden className="size-4" />
    </span>
  );
}

function HistoryWhatHappened({ row }: { row: HistoryRow }) {
  const icon = row.breakdown ? (
    <BreakdownUrgencyIcon urgency={row.breakdown.urgency} size={16} />
  ) : row.kind === 'service' ? (
    <HistoryTile {...serviceTile} />
  ) : (
    <HistoryTile {...((row.readingRole && readingTiles[row.readingRole]) ?? otherReadingTile)} />
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
          summary: `Reading · ${formatHours(reading.value)} · ${readingRoleLabels[reading.role]}`,
          title: `${readingRoleLabels[reading.role]} · ${formatHours(reading.value)}`,
          detail: reading.jobNumber,
          readingRole: reading.role,
          ...(reading.jobNumber ? { jobNumber: reading.jobNumber } : {}),
          evidence: readingEvidence({ ...reading, photoBacked: reading.photo !== null }).evidenceLabel,
        })),
        ...(breakdowns.data?.items ?? []).map((breakdown) => ({
          id: breakdown.id,
          kind: 'breakdown' as const,
          kindLabel: historyKindLabels.breakdown,
          at: breakdown.reportedAt,
          summary: `Breakdown · ${breakdownUrgencyLabels[breakdown.urgency]} · ${breakdown.firstLine} · ${breakdownStatusLabels[breakdown.status]}`,
          title: breakdown.firstLine,
          detail: breakdown.jobNumber
            ? `${breakdown.jobNumber} · reported by ${getFirstName(breakdown.reporterName)}`
            : `Reported by ${getFirstName(breakdown.reporterName)}`,
          breakdown: { id: breakdown.id, urgency: breakdown.urgency, status: breakdown.status },
        })),
        ...(services.data ?? []).map((service) => {
          const summary = [
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
            summary,
            title: summary,
            detail:
              service.nextServiceDueHoursSet === null
                ? null
                : `Next service due set to ${formatHours(service.nextServiceDueHoursSet)}`,
          };
        }),
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
      historyKindColumn({ isMachine: machineId !== null, readsBreakdowns, readsServices }),
      {
        accessorKey: 'summary',
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
          onOpen={(row) => {
            if (row.breakdown) void navigate({ to: '/contracting/workshop/$id', params: { id: row.breakdown.id } });
            else if (row.jobNumber) void navigate({ to: '/contracting/jobs/$code', params: { code: row.jobNumber } });
            else if (row.kind === 'service') onOpenService?.();
          }}
          emptyMessage="Nothing has happened to it yet."
          searchPlaceholder="Search history…"
          getRowId={(row) => `${row.kind}-${row.id}`}
        />
      </CardContent>
    </Card>
  );
}
