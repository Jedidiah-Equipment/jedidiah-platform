import { formatCurrency, formatDate, formatNumber } from '@pkg/domain';
import { jobQueueLabels } from '@pkg/domain/contracting';
import type { JobSummary } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { EnumSelect } from '@/components/common/EnumSelect.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { jobCardUrl } from '@/contracting/lib/contracting-http-paths.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobQueueLoadMore, useJobQueuePages } from '../jobs/use-job-queue-pages.js';
import { type StampableJob, StampInvoiceDialog } from './StampInvoiceDialog.js';
import {
  type InvoicingTab,
  invoicedInMonth,
  invoicedMonthOptions,
  invoicingTabs,
  monthKey,
  monthLabel,
} from './types.js';

export function InvoicingPage({ tab, month: requestedMonth }: { tab: InvoicingTab; month: string | undefined }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const canStamp = useCan('contracting_invoice:update').can;
  const [now] = useState(() => new Date());
  const month = requestedMonth ?? monthKey(now);
  const monthOptions = useMemo(() => invoicedMonthOptions(now), [now]);
  const monthLabels = useMemo(
    () => Object.fromEntries(monthOptions.map((option) => [option.value, option.label])),
    [monthOptions],
  );
  const [stamping, setStamping] = useState<StampableJob | null>(null);
  const counts = useQuery(trpc.contractingJobs.jobs.queueCounts.queryOptions());
  const view = tab === 'invoiced' ? `invoiced:${month}` : tab;
  const jobs = useJobQueuePages(
    tab === 'invoiced' ? { queue: tab, invoicedInMonth: invoicedInMonth(month) } : { queue: tab },
    tab === 'invoiced' ? undefined : counts.data?.[tab],
  );
  const columns = useMemo<DataTableColumnDef<JobSummary>[]>(
    () => [
      {
        accessorKey: 'jobNumber',
        header: 'Job',
        enableSorting: true,
        cell: ({ row }) => <span className="font-mono font-semibold">{row.original.jobNumber}</span>,
      },
      {
        id: 'customer',
        header: 'Customer · Farm',
        accessorFn: (job) => `${job.customerName} · ${job.farmName}`,
      },
      { accessorKey: 'workTypeName', header: 'Work type' },
      {
        id: 'total',
        header: 'Total ex VAT',
        cell: ({ row }) => (row.original.pricedTotal === null ? '—' : formatCurrency(row.original.pricedTotal)),
      },
      ...(tab === 'awaiting-invoice'
        ? [
            {
              id: 'priced',
              header: 'Priced',
              cell: ({ row }) => formatDate(row.original.pricedAt, 'short', '—'),
            } satisfies DataTableColumnDef<JobSummary>,
            {
              id: 'stamp',
              header: 'Invoice №',
              cell: ({ row }) => {
                const { pricedTotal } = row.original;
                return canStamp && pricedTotal !== null ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(event) => {
                      event.stopPropagation();
                      setStamping({ ...row.original, pricedTotal });
                    }}
                  >
                    Stamp
                  </Button>
                ) : null;
              },
            } satisfies DataTableColumnDef<JobSummary>,
          ]
        : [
            {
              accessorKey: 'invoiceNumber',
              header: 'Invoice №',
              cell: ({ row }) => <span className="font-mono">{row.original.invoiceNumber}</span>,
            } satisfies DataTableColumnDef<JobSummary>,
            {
              id: 'invoiced',
              header: 'Invoiced',
              cell: ({ row }) => formatDate(row.original.invoicedAt, 'short', '—'),
            } satisfies DataTableColumnDef<JobSummary>,
          ]),
      {
        id: 'job-card',
        header: 'Job card',
        cell: ({ row }) => (
          <Button
            render={
              <a
                href={jobCardUrl(row.original.jobNumber, 'customer')}
                rel="noreferrer"
                target="_blank"
                onClick={(event) => event.stopPropagation()}
              />
            }
            size="sm"
            variant="outline"
          >
            Job card
          </Button>
        ),
      },
    ],
    [tab, canStamp],
  );
  return (
    <PageLayout title="Invoicing" description="Stamp invoice numbers and review invoiced Jobs." size="full">
      <ErrorMessage error={counts.error ?? jobs.error} fallbackMessage="Unable to load Invoicing." />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({ to: '/contracting/invoicing', search: { tab: value as InvoicingTab } })
        }
      >
        <TabsList>
          {invoicingTabs.map((item) => (
            <TabsTrigger key={item} value={item}>
              {item === 'awaiting-invoice'
                ? `${jobQueueLabels[item]} (${formatNumber(counts.data?.[item] ?? 0)})`
                : 'Invoiced'}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ClientDataTable
        key={view}
        columns={columns}
        rows={jobs.rows}
        loading={jobs.isPending}
        emptyMessage={
          tab === 'invoiced' ? `No Jobs were invoiced in ${monthLabel(month)}.` : 'Nothing is waiting for an invoice.'
        }
        searchPlaceholder="Search Jobs…"
        controls={
          tab === 'invoiced' ? (
            <EnumSelect
              aria-label="Invoiced in"
              labels={{ ...monthLabels, [month]: monthLabel(month) }}
              options={monthOptions.map((option) => option.value)}
              value={month}
              onChange={(next) => void navigate({ to: '/contracting/invoicing', search: { tab, month: next } })}
            />
          ) : undefined
        }
        onOpen={(job) => void navigate({ to: '/contracting/jobs/$code', params: { code: job.jobNumber } })}
      />
      <JobQueueLoadMore pages={jobs} />
      {stamping ? (
        <StampInvoiceDialog
          job={stamping}
          open
          onOpenChange={(open) => {
            if (!open) setStamping(null);
          }}
        />
      ) : null}
    </PageLayout>
  );
}
