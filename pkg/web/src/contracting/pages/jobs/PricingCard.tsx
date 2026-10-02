import { formatCurrency, formatDate } from '@pkg/domain';
import { pricingGateReasons } from '@pkg/domain/contracting';
import type { JobDetail } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useDataTable } from '@/components/data-table/features.js';
import { HelpLink } from '@/components/help/index.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.js';
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
import { AddChargeLineDialog, useChargeLineMutations } from './ChargeLineEditing.js';
import { ChargeLinesTable } from './ChargeLinesTable.js';
import {
  adjustmentPricingColumns,
  adjustmentRowId,
  machinePricingColumns,
  machinePricingRowId,
} from './PricingCells.js';
import { adjustmentRows, machinePricingRows } from './pricing.js';
import { PricingContext, type PricingMutations, usePricingMutations } from './pricing-context.js';
import type { JobSheet } from './types.js';

export function PricingCard({ job, sheet }: { job: JobDetail; sheet: JobSheet }) {
  const trpc = useTRPC();
  const editable = sheet.can('price');
  const chargeEditable = sheet.can('editChargeLines');
  const chargeAmountEditable = sheet.can('priceChargeLines');
  const addLineAction = sheet.action('editChargeLines');
  const priceAction = sheet.action('price');
  const rates = useQuery(trpc.contractingRateCard.rates.options.queryOptions(undefined, { enabled: editable }));
  const mutations = usePricingMutations();
  const chargeLineMutations = useChargeLineMutations();
  const [addingChargeLine, setAddingChargeLine] = useState(false);
  const hash = useLocation({ select: (location) => location.hash });
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hash === 'pricing') section.current?.scrollIntoView({ block: 'start' });
  }, [hash]);
  const machineRows = useMemo(() => machinePricingRows(job.assignments), [job.assignments]);
  const adjustments = useMemo(() => adjustmentRows(job, { editable }), [job, editable]);
  const machineTable = useDataTable({
    columns: machinePricingColumns,
    data: machineRows,
    getRowId: machinePricingRowId,
  });
  const adjustmentTable = useDataTable({
    columns: adjustmentPricingColumns,
    data: adjustments,
    getRowId: adjustmentRowId,
  });
  const pricing = useMemo(
    () => ({ job, editable, rates: rates.data ?? [], mutations }),
    [job, editable, rates.data, mutations],
  );
  if (!sheet.seesMoney) return null;
  return (
    <section id="pricing" ref={section} aria-label="Pricing" className="scroll-mt-4">
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardAction>
            <HelpLink label="How to price a Job" topic="contractingJobPricing" />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-6">
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
          <ErrorMessage
            error={
              chargeLineMutations.create.error ?? chargeLineMutations.patch.error ?? chargeLineMutations.remove.error
            }
            fallbackMessage="Unable to update Charge Lines."
          />
          <PricingContext.Provider value={pricing}>
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Machine Assignments</h3>
                <DataTable
                  table={machineTable}
                  paginationMode="complete"
                  total={machineRows.length}
                  hideGlobalFilter
                  hideFooter
                  emptyMessage="No Machine Assignments to price."
                  getRowClassName={(row) => (row.kind === 'subtotal' ? 'bg-muted/40 font-medium' : undefined)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">Charge lines</h3>
                  {addLineAction ? (
                    <Button size="sm" {...addLineAction} onClick={() => setAddingChargeLine(true)}>
                      Add charge line
                    </Button>
                  ) : null}
                </div>
                <ChargeLinesTable
                  lines={job.chargeLines}
                  editable={chargeEditable}
                  amountEditable={chargeAmountEditable}
                  missingAmount="needs-amount"
                  mutations={chargeLineMutations}
                />
              </div>
              {adjustments.length ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Adjustments</h3>
                  <DataTable
                    table={adjustmentTable}
                    paginationMode="complete"
                    total={adjustments.length}
                    hideGlobalFilter
                    hideFooter
                    emptyMessage="No adjustments."
                  />
                </div>
              ) : null}
            </div>
          </PricingContext.Provider>
          <PricingTotals job={job} />
        </CardContent>
        {priceAction ? (
          <CardFooter className="justify-end gap-3">
            <MarkPriced job={job} mutations={mutations} action={priceAction} />
          </CardFooter>
        ) : null}
      </Card>
      <AddChargeLineDialog
        jobId={job.id}
        open={addingChargeLine}
        onOpenChange={setAddingChargeLine}
        create={chargeLineMutations.create}
      />
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

function MarkPriced({
  job,
  mutations,
  action,
}: {
  job: JobDetail;
  mutations: PricingMutations;
  action: { disabled: boolean; title: string | undefined };
}) {
  const [confirm, setConfirm] = useState(false);
  const pricing = job.pricing;
  if (!pricing) return null;
  const reasons = pricingGateReasons(pricing.gate);
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-3">
      {reasons.length && !action.disabled ? <p className="text-destructive">{reasons.join(' · ')}</p> : null}
      <Button disabled={action.disabled || !pricing.gate.ok} title={action.title} onClick={() => setConfirm(true)}>
        Mark as Priced
      </Button>
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
