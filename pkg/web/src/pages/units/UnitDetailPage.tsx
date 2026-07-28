import { formatDate } from '@pkg/domain';
import type { ProductUnitDetail, ProductUnitOwnershipTransfer, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { ProductUnitBuildStateCell, ProductUnitOwnerCell } from './components/ProductUnitOwnerCell.js';

type UnitDetailPageProps = {
  unitId: UUID;
};

export const UnitDetailPage: React.FC<UnitDetailPageProps> = ({ unitId }) => {
  const trpc = useTRPC();
  const unitQuery = useQuery(trpc.productUnits.get.queryOptions({ id: unitId }));

  return (
    <PageLayout
      description={unitQuery.data?.product?.name ?? 'Product unit'}
      size="lg"
      title={unitQuery.data?.productSerialNumber ?? 'Loading unit...'}
    >
      {unitQuery.isPending ? <Skeleton className="h-64 w-full" /> : null}
      <ErrorMessage error={unitQuery.error} fallbackMessage="Unable to load unit." />
      {unitQuery.data ? <UnitDetail unit={unitQuery.data} /> : null}
    </PageLayout>
  );
};

const UnitDetail: React.FC<{ unit: ProductUnitDetail }> = ({ unit }) => {
  const canReadJobs = useCan('job:read').can;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Machine</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailField label="Serial">
            <span className="font-mono tabular-nums">{unit.productSerialNumber}</span>
          </DetailField>
          <DetailField label="Product">{unit.product ? unit.product.name : <EmptyValue />}</DetailField>
          <DetailField label="VIN">{unit.vinNumber ?? <EmptyValue />}</DetailField>
          <DetailField label="Owner">
            <ProductUnitOwnerCell owner={unit.owner} />
          </DetailField>
          <DetailField label="Build">
            <ProductUnitBuildStateCell buildState={unit.buildState} />
          </DetailField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fitted assemblies</CardTitle>
        </CardHeader>
        <CardContent>
          {unit.asBuiltSpec.length === 0 ? (
            <p className="text-muted-foreground text-sm">No optional assemblies are fitted to this machine.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {unit.asBuiltSpec.map((assembly) => (
                <li key={assembly.id}>{assembly.name}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ownership history</CardTitle>
        </CardHeader>
        <CardContent>
          {unit.ownershipHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This machine has never changed hands — we have held it since it was built.
            </p>
          ) : (
            <ol className="grid gap-3">
              {unit.ownershipHistory.map((transfer) => (
                <OwnershipTransferRow key={transfer.id} transfer={transfer} />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {unit.jobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No Job is bound to this machine.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {unit.jobs.map((job) => (
                <li className="flex items-center gap-3" key={job.id}>
                  {canReadJobs ? (
                    <Link className="font-medium underline underline-offset-4" params={{ id: job.id }} to="/jobs/$id">
                      {job.code}
                    </Link>
                  ) : (
                    <span className="font-medium">{job.code}</span>
                  )}
                  <span className="text-muted-foreground">
                    {job.completedOn ? `Completed ${formatDate(job.completedOn, 'short')}` : 'In progress'}
                  </span>
                  {job.cancelledAt ? <span className="text-muted-foreground">Cancelled</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const OwnershipTransferRow: React.FC<{ transfer: ProductUnitOwnershipTransfer }> = ({ transfer }) => (
  <li className="grid gap-1 border-border border-b pb-3 last:border-b-0 last:pb-0">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="tabular-nums">{formatDate(transfer.occurredOn, 'short')}</span>
      <span className="text-muted-foreground">
        {transfer.fromCustomer?.companyName ?? 'Stock'} → {transfer.toCustomer?.companyName ?? 'Stock'}
      </span>
    </div>
    <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
      {/* A null actor is the system: the backfill, not a person. */}
      <span>Recorded by {transfer.actor?.name ?? 'the system'}</span>
      {transfer.sourceQuote ? <span>Quote {transfer.sourceQuote.code}</span> : null}
      {transfer.note ? <span>{transfer.note}</span> : null}
    </div>
  </li>
);

const DetailField: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
  <div className="grid gap-1">
    <span className="text-muted-foreground text-xs uppercase tracking-wide">{label}</span>
    <span className="flex min-w-0 items-center text-sm">{children}</span>
  </div>
);

const EmptyValue: React.FC = () => <span className="text-muted-foreground">—</span>;
