import { formatDate, formatJobLifecycleStatus } from '@pkg/domain';
import type { ProductUnitDetail, ProductUnitOwnershipTransfer, ProductUnitUpdateInput, UUID } from '@pkg/schema';
import { IconArrowsExchange } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { ProductUnitBuildStateCell } from './components/ProductUnitBuildStateCell.js';
import { ProductUnitOwnerCell } from './components/ProductUnitOwnerCell.js';
import { UnitTransferDialog } from './components/UnitTransferDialog.js';
import { toProductUnitUpdateInput, toUnitEditFormValues, UnitEditFormValues } from './components/unit-edit-form.js';

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
      {unitQuery.data ? <UnitDetail key={unitQuery.data.id} unit={unitQuery.data} /> : null}
    </PageLayout>
  );
};

const UnitDetail: React.FC<{ unit: ProductUnitDetail }> = ({ unit }) => {
  const canReadJobs = useCan('job:read').can;
  const canUpdateUnit = useCan('product_unit:update').can;
  const canTransferUnit = useCan('product_unit:transfer').can;
  const canRemoveUnit = useCan('product_unit:remove').can;
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  return (
    <div className="grid gap-4">
      {canUpdateUnit ? <EditableUnitIdentity unit={unit} /> : <ReadOnlyUnitIdentity unit={unit} />}

      <Card>
        <CardHeader>
          <CardTitle>Fitted assemblies</CardTitle>
        </CardHeader>
        <CardContent>
          {unit.asBuiltSpec.length === 0 ? (
            <p className="text-muted-foreground text-sm">No optional assemblies are fitted to this unit.</p>
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
          {canTransferUnit ? (
            <CardAction span="title">
              <Button onClick={() => setIsTransferOpen(true)} type="button" variant="outline">
                <IconArrowsExchange data-icon="inline-start" />
                Record transfer
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          {unit.ownershipHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This unit has never changed hands — we have held it since it was built.
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
            <p className="text-muted-foreground text-sm">No Job is bound to this unit.</p>
          ) : (
            <ul className="grid gap-2 text-sm">
              {unit.jobs.map((job) => (
                <li className="flex items-center gap-3" key={job.id}>
                  {canReadJobs ? (
                    <Link
                      className="font-medium underline underline-offset-4"
                      params={{ id: job.id }}
                      to="/equipment/jobs/$id"
                    >
                      {job.code}
                    </Link>
                  ) : (
                    <span className="font-medium">{job.code}</span>
                  )}
                  <span className="text-muted-foreground">{formatJobLifecycleStatus(job, 'short')}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canRemoveUnit ? (
        <div className="mt-4 flex justify-end border-t pt-4">
          <RemoveUnitButton unit={unit} />
        </div>
      ) : null}

      {canTransferUnit ? (
        <UnitTransferDialog onOpenChange={setIsTransferOpen} open={isTransferOpen} unit={unit} />
      ) : null}
    </div>
  );
};

/**
 * The one way a Unit leaves the workspace. It reaches only a machine that was never built, so the
 * server refuses anything still real and the message it returns is what the person reads.
 */
const RemoveUnitButton: React.FC<{ unit: ProductUnitDetail }> = ({ unit }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateProductUnits, invalidateJobs } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const removeUnitMutation = useMutation(
    trpc.productUnits.remove.mutationOptions({
      onSuccess: async () => {
        await Promise.all([invalidateProductUnits(), invalidateJobs()]);
        await navigate({ to: '/equipment/units' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to remove unit.');
      },
    }),
  );

  return (
    <RemoveEntityButton
      description={
        <>
          Delete {unit.productSerialNumber} for good. Do this only when the machine was never built — its cancelled Jobs
          and Quotes stay, and the serial is never issued again.{' '}
          {/* Ownership no longer refuses removal, so the holder has to be on the confirmation: a
              build-to-order phantom is owned from the moment it is minted. */}
          {unit.owner === null
            ? 'It is held as stock.'
            : `${unit.owner.companyName} currently holds it, and that ownership history goes with it.`}
        </>
      }
      isPending={removeUnitMutation.isPending}
      onConfirm={() => removeUnitMutation.mutate({ id: unit.id })}
      title="Remove unit"
      triggerLabel="Remove unit"
    />
  );
};

/**
 * The machine's identity. Only the VIN is editable: the serial is minted with the Unit and the Product
 * it was built as is a fact about the build, so both are shown and neither can be typed over.
 */
const UnitIdentityCard: React.FC<{
  action?: React.ReactNode;
  unit: ProductUnitDetail;
  vin: React.ReactNode;
}> = ({ action, unit, vin }) => (
  <Card>
    <CardHeader>
      <CardTitle>Unit</CardTitle>
      {action ? <CardAction span="title">{action}</CardAction> : null}
    </CardHeader>
    <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <DetailField label="Serial">
        <span className="font-mono tabular-nums">{unit.productSerialNumber}</span>
      </DetailField>
      <DetailField label="Product">{unit.product.name}</DetailField>
      {vin}
      <DetailField label="Owner">
        <ProductUnitOwnerCell owner={unit.owner} />
      </DetailField>
      <DetailField label="Build">
        <ProductUnitBuildStateCell buildState={unit.buildState} owner={unit.owner} />
      </DetailField>
    </CardContent>
  </Card>
);

const ReadOnlyUnitIdentity: React.FC<{ unit: ProductUnitDetail }> = ({ unit }) => (
  <UnitIdentityCard unit={unit} vin={<DetailField label="VIN">{unit.vinNumber ?? <EmptyValue />}</DetailField>} />
);

const EditableUnitIdentity: React.FC<{ unit: ProductUnitDetail }> = ({ unit }) => {
  const trpc = useTRPC();
  const { invalidateJobs, invalidateProductUnits } = useQueryInvalidation();
  const updateUnitMutation = useMutation(
    trpc.productUnits.update.mutationOptions({
      onSuccess: async () => {
        // Job surfaces report the machine's VIN, so they go stale the moment it changes.
        await Promise.all([invalidateProductUnits(), invalidateJobs()]);
      },
    }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: toUnitEditFormValues(unit),
    failureMessage: 'Unable to update unit.',
    save: (value: ProductUnitUpdateInput) => updateUnitMutation.mutateAsync(value),
    toInput: (value) => toProductUnitUpdateInput(unit.id, value),
    validator: UnitEditFormValues,
  });

  return (
    <form {...formProps}>
      <UnitIdentityCard
        action={<AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />}
        unit={unit}
        vin={
          <form.AppField name="vinNumber">
            {(field) => <field.TextField label="VIN" placeholder="Not captured" />}
          </form.AppField>
        }
      />
    </form>
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
