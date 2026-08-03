import { formatCurrency, formatDate } from '@pkg/domain';
import type { PurchaseOrderView } from '@pkg/schema';
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { purchaseOrdersPageDescription } from '@/utils/page-descriptions.js';
import { PurchaseOrderStatusBadge } from './components/PurchaseOrderStatusBadge.js';
import { PurchaseOrderCreateDialog } from './PurchaseOrderCreateDialog.js';

export const PurchaseOrdersPage: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const canCreate = useCan('purchase_order:create').can;
  const canReadCosts = useCan('inventory_cost:read').can;
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const purchaseOrdersQuery = useQuery(
    trpc.purchaseOrders.list.queryOptions({
      cursor: 0,
      limit: 0,
      search: '',
      sortBy: 'createdAt',
      sortDirection: 'desc',
    }),
  );

  return (
    <>
      <PageLayout
        actions={
          canCreate ? (
            <Button onClick={() => setIsCreateOpen(true)} type="button">
              <IconPlus data-icon="inline-start" />
              New Purchase Order
            </Button>
          ) : null
        }
        description={purchaseOrdersPageDescription}
        size="lg"
        title="Purchase Orders"
      >
        {purchaseOrdersQuery.isPending ? <Skeleton className="h-40 w-full" /> : null}
        <ErrorMessage error={purchaseOrdersQuery.error} fallbackMessage="Unable to load Purchase Orders." />
        {purchaseOrdersQuery.data ? (
          <PurchaseOrderTable
            canReadCosts={canReadCosts}
            items={purchaseOrdersQuery.data.items}
            onOpen={(id) => navigate({ params: { id }, to: '/purchase-orders/$id' })}
          />
        ) : null}
      </PageLayout>
      {canCreate ? <PurchaseOrderCreateDialog onOpenChange={setIsCreateOpen} open={isCreateOpen} /> : null}
    </>
  );
};

const PurchaseOrderTable: React.FC<{
  canReadCosts: boolean;
  items: PurchaseOrderView[];
  onOpen: (id: PurchaseOrderView['id']) => void;
}> = ({ canReadCosts, items, onOpen }) => {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No Purchase Orders found.</p>;
  }

  return (
    <Card>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Jobs</TableHead>
              <TableHead>Expected</TableHead>
              {canReadCosts ? <TableHead className="text-right">Total</TableHead> : null}
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((purchaseOrder) => (
              <TableRow
                className="cursor-pointer"
                key={purchaseOrder.id}
                onClick={() => onOpen(purchaseOrder.id)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onOpen(purchaseOrder.id);
                }}
              >
                <TableCell className="font-medium">{purchaseOrder.code}</TableCell>
                <TableCell>{purchaseOrder.supplier.companyName}</TableCell>
                <TableCell>{purchaseOrder.jobs.map((job) => job.code).join(', ') || 'Restock'}</TableCell>
                <TableCell>
                  {purchaseOrder.expectedDeliveryDate ? formatDate(purchaseOrder.expectedDeliveryDate) : 'Not set'}
                </TableCell>
                {canReadCosts ? (
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(totalFor(purchaseOrder), 'ZAR')}
                  </TableCell>
                ) : null}
                <TableCell>
                  <PurchaseOrderStatusBadge status={purchaseOrder.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

function totalFor(purchaseOrder: PurchaseOrderView): number {
  return purchaseOrder.lines.reduce((total, line) => total + line.quantity * (line.unitPrice ?? 0), 0);
}
