import { formatCurrency, formatDate, formatNumber } from '@pkg/domain';
import { pricingGateReasons } from '@pkg/domain/contracting';
import type { JobDetail } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useDataTable } from '@/components/data-table/features.js';
import { HelpLink } from '@/components/help/index.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { useTRPC } from '@/lib/trpc.js';
import { pricingColumns, pricingRowId } from './PricingCells.js';
import { pricingRows } from './pricing.js';
import { PricingContext, type PricingMutations, usePricingMutations } from './pricing-context.js';
import type { JobCapabilities } from './types.js';

export function PricingCard({ job, capabilities }: { job: JobDetail; capabilities: JobCapabilities }) {
  const trpc = useTRPC();
  const editable = capabilities.price;
  const rates = useQuery(trpc.contractingRateCard.rates.options.queryOptions(undefined, { enabled: editable }));
  const mutations = usePricingMutations();
  const hash = useLocation({ select: (location) => location.hash });
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hash === 'pricing') section.current?.scrollIntoView({ block: 'start' });
  }, [hash]);
  const rows = useMemo(() => pricingRows(job, { editable }), [job, editable]);
  const nothingChosen = job.assignments.every((stint) => stint.rateUnitAmount === null);
  const table = useDataTable({ columns: pricingColumns, data: rows, getRowId: pricingRowId });
  const pricing = useMemo(
    () => ({ job, editable, rates: rates.data ?? [], mutations }),
    [job, editable, rates.data, mutations],
  );
  if (!capabilities.seePricing) return null;
  return (
    <section id="pricing" ref={section} aria-label="Pricing" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle>
            Pricing <HelpLink label="How to price a Job" topic="contractingJobPricing" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {job.reopenedAt ? (
            <Alert>
              <AlertTitle>Re-pricing needed</AlertTitle>
              <AlertDescription>
                {job.repricingNote} · {formatDate(job.reopenedAt, 'medium')}
              </AlertDescription>
            </Alert>
          ) : null}
          {job.pricedAt && job.pricedTotal !== null ? (
            <p className="font-medium">
              Priced {formatDate(job.pricedAt)} · {formatCurrency(job.pricedTotal)} ex VAT
            </p>
          ) : null}
          {!editable && job.status === 'completed' && nothingChosen ? (
            <p className="text-muted-foreground">Awaiting pricing.</p>
          ) : (
            <>
              <PricingContext.Provider value={pricing}>
                <DataTable
                  table={table}
                  paginationMode="complete"
                  total={rows.length}
                  hideGlobalFilter
                  emptyMessage="Nothing to price."
                  getRowClassName={(row) => (row.kind === 'subtotal' ? 'bg-muted/40 font-medium' : undefined)}
                  totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'line' : 'lines'}`}
                />
              </PricingContext.Provider>
              {job.chargeLines.length && editable ? (
                <a className="text-primary text-sm underline-offset-4 hover:underline" href="#charge-lines">
                  Edit charge lines ↓
                </a>
              ) : null}
              <PricingTotals job={job} />
            </>
          )}
          {editable ? <MarkPriced job={job} mutations={mutations} /> : null}
        </CardContent>
      </Card>
    </section>
  );
}

function PricingTotals({ job }: { job: JobDetail }) {
  if (!job.pricing) return null;
  const lines = [
    ['Subtotal', formatCurrency(job.pricing.subtotal)],
    ['Discount', job.pricing.discountAmount ? `− ${formatCurrency(job.pricing.discountAmount)}` : formatCurrency(0)],
    ['Diesel (VAT-exempt)', formatCurrency(job.pricing.dieselAmount)],
  ] as const;
  return (
    <dl className="ml-auto grid w-full max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
      {lines.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right">{value}</dd>
        </div>
      ))}
      <dt className="font-semibold">Total ex VAT</dt>
      <dd className="text-right font-semibold">{formatCurrency(job.pricing.total)}</dd>
    </dl>
  );
}

function MarkPriced({ job, mutations }: { job: JobDetail; mutations: PricingMutations }) {
  const [confirm, setConfirm] = useState(false);
  const pricing = job.pricing;
  if (!pricing) return null;
  const reasons = pricingGateReasons(pricing.gate);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button disabled={!pricing.gate.ok} onClick={() => setConfirm(true)}>
        Mark as Priced
      </Button>
      {reasons.length ? <p className="text-destructive">{reasons.join(' · ')}</p> : null}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Priced?</DialogTitle>
            <DialogDescription>
              Subtotal {formatCurrency(pricing.subtotal)} · Discount {formatCurrency(pricing.discountAmount)} · Diesel{' '}
              {formatCurrency(pricing.dieselAmount)} · Total {formatCurrency(pricing.total)} ex VAT. The amounts freeze
              and the Job moves to Awaiting invoice.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              disabled={mutations.markPriced.isPending}
              onClick={() =>
                mutations.markPriced.mutate(
                  { id: job.id, expectedTotal: pricing.total },
                  { onSettled: () => setConfirm(false) },
                )
              }
            >
              Mark as Priced
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
