import { formatDate, formatNumber, getPlantDateNow } from '@pkg/domain';
import type { DateOnlyIso } from '@pkg/schema';
import type { PurchaseOrderLineView, PurchaseOrderView } from '@pkg/schema/equipment';
import { IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Empty, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { receivingPageDescription } from '@/equipment/utils/page-descriptions.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { PurchaseOrderReceivingLines } from './components/PurchaseOrderReceivingLines.js';
import { outstandingQuantity } from './components/types.js';

export const ReceivingPage: React.FC = () => {
  const trpc = useTRPC();
  const canReadCosts = useCan('equipment_inventory_cost:read').can;
  const canReceive = useCan('equipment_purchase_order:receive').can;
  const [search, setSearch] = useState('');
  const outstandingQuery = useQuery(trpc.purchaseOrders.outstandingLines.queryOptions());

  return (
    <PageLayout description={receivingPageDescription} title="Receiving">
      <InputGroup>
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search outstanding lines"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search order, Supplier, Part code, or description..."
          value={search}
        />
      </InputGroup>
      <ErrorMessage error={outstandingQuery.error} fallbackMessage="Unable to load outstanding lines." />
      {outstandingQuery.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <ReceivingList
          canReadCosts={canReadCosts}
          canReceive={canReceive}
          items={outstandingQuery.data?.items ?? []}
          search={search}
          today={getPlantDateNow()}
        />
      )}
    </PageLayout>
  );
};

export function ReceivingList({
  canReadCosts,
  canReceive,
  items,
  search,
  today,
}: {
  canReadCosts: boolean;
  canReceive: boolean;
  items: PurchaseOrderView[];
  search: string;
  today: DateOnlyIso;
}) {
  const owedGroups = useMemo(() => toOwedGroups(items), [items]);
  const groups = useMemo(() => searchOwedGroups(owedGroups, search), [owedGroups, search]);

  if (groups.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyIcon />
          <EmptyTitle>{owedGroups.length === 0 ? 'Nothing is owed on any open order' : 'No line matches'}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-4">
      {groups.map(({ lines, owedLineCount, purchaseOrder }) => (
        <Card key={purchaseOrder.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Link
                className="font-mono hover:underline"
                params={{ id: purchaseOrder.id }}
                to="/equipment/purchase-orders/$id"
              >
                {purchaseOrder.code}
              </Link>
              <span>{purchaseOrder.supplier.companyName}</span>
              {purchaseOrder.expectedDeliveryDate !== null && purchaseOrder.expectedDeliveryDate < today ? (
                <Badge variant="destructive">Late</Badge>
              ) : null}
            </CardTitle>
            <CardDescription>
              {purchaseOrder.expectedDeliveryDate === null
                ? 'No expected date'
                : `Expected ${formatDate(purchaseOrder.expectedDeliveryDate)}`}{' '}
              · {formatNumber(owedLineCount)} {owedLineCount === 1 ? 'line' : 'lines'} owed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PurchaseOrderReceivingLines
              canReadCosts={canReadCosts}
              canReceive={canReceive && purchaseOrder.actions.receive.allowed}
              lines={lines}
              purchaseOrder={purchaseOrder}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type OwedGroup = { lines: PurchaseOrderLineView[]; owedLineCount: number; purchaseOrder: PurchaseOrderView };

function toOwedGroups(items: PurchaseOrderView[]): OwedGroup[] {
  return items.flatMap((purchaseOrder) => {
    const lines = purchaseOrder.lines.filter((line) => outstandingQuantity(line) > 0);

    return lines.length === 0 ? [] : [{ lines, owedLineCount: lines.length, purchaseOrder }];
  });
}

/**
 * Keeps the server's order of orders. A match on the order itself keeps every owed line, so a whole
 * delivery shows when searched by its note; otherwise only the matching lines stay.
 */
function searchOwedGroups(groups: OwedGroup[], search: string): OwedGroup[] {
  const query = search.trim().toLowerCase();
  if (query === '') return groups;
  const codeQuery = query.replace(/^po-?/, '');

  return groups.flatMap((group) => {
    const { purchaseOrder } = group;
    const orderMatches =
      (codeQuery !== '' && purchaseOrder.code.toLowerCase().replace(/^po-?/, '').includes(codeQuery)) ||
      purchaseOrder.supplier.companyName.toLowerCase().includes(query);
    if (orderMatches) return [group];
    const lines = group.lines.filter(
      (line) =>
        (line.kind === 'part' && line.partCode.toLowerCase().includes(query)) ||
        line.description.toLowerCase().includes(query),
    );

    return lines.length === 0 ? [] : [{ ...group, lines }];
  });
}
