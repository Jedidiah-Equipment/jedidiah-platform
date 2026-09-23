import { formatCurrency, formatDate } from '@pkg/domain';
import type { JobDetail } from '@pkg/schema/contracting';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { StampInvoiceDialog } from '../invoicing/StampInvoiceDialog.js';
import type { JobSheet } from './types.js';

export function InvoiceCard({ job, sheet }: { job: JobDetail; sheet: JobSheet }) {
  const [stamping, setStamping] = useState(false);
  if (!sheet.seesMoney || (job.status !== 'priced' && job.status !== 'invoiced')) return null;
  return (
    <section aria-label="Invoice">
      <Card>
        <CardHeader>
          <CardTitle>Invoice</CardTitle>
        </CardHeader>
        <CardContent>
          {job.status === 'invoiced' ? (
            <div className="flex flex-wrap items-center gap-3">
              <p>
                Invoiced {formatDate(job.invoicedAt, 'medium')} ·{' '}
                <span className="font-mono font-semibold">{job.invoiceNumber}</span>
                {job.invoicedByName ? ` · by ${job.invoicedByName}` : null}
              </p>
              <Badge variant="secondary">Locked</Badge>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                {job.pricedTotal === null ? null : `${formatCurrency(job.pricedTotal)} ex VAT · `}
                Priced {formatDate(job.pricedAt)} · awaiting an invoice number
              </p>
              {sheet.can('stampInvoice') && job.pricedTotal !== null ? (
                <Button onClick={() => setStamping(true)}>Stamp invoice number</Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
      {stamping && job.pricedTotal !== null ? (
        <StampInvoiceDialog job={{ ...job, pricedTotal: job.pricedTotal }} open onOpenChange={setStamping} />
      ) : null}
    </section>
  );
}
