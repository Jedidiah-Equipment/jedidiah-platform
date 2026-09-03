import { useDebouncedValue } from '@mantine/hooks';
import { hasPermission } from '@pkg/domain';
import type { Bay, StockBuildCreateInput } from '@pkg/schema';
import { IconLoader2 } from '@tabler/icons-react';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { EntityCombobox } from '@/components/common/EntityCombobox.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useAppForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { type ProductOption, useProductOptions } from '@/equipment/hooks/options/index.js';
import { useBayCalendars } from '@/equipment/hooks/use-bay-calendars.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import { BoardGantt } from './components/BoardGantt.js';
import { JobBaySeedsCard } from './components/JobBaySeedsCard.js';
import { type BaySeedScheduling, createBaySeedScheduling, getBaySeedBayMap } from './components/job-bay-seeds.js';
import { StockBuildSpecSelector } from './components/StockBuildSpecSelector.js';
import {
  emptyStockBuildFormValues,
  StockBuildFormValues,
  toStockBuildBaySeeds,
  toStockBuildCreateInput,
} from './components/stock-build-form.js';

const STOCK_BUILD_DESCRIPTION =
  'Build a machine for the showroom floor. It gets a serial, a CFO, documents and Bay time like any other build; it just has no customer and no sale behind it.';

export const StockBuildPage: React.FC = () => {
  const accessQuery = useAccess();
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');

  return (
    <PageLayout description={STOCK_BUILD_DESCRIPTION} size="full" title="New Stock Build">
      {accessQuery.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : canCreateJob ? (
        <StockBuildContent />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyIcon />
            <EmptyTitle>You cannot start a Stock Build.</EmptyTitle>
            <EmptyDescription>Creating a Job needs the Create jobs permission.</EmptyDescription>
          </EmptyHeader>
          <Button render={<Link to="/equipment/jobs/list" />} variant="outline">
            Back to Job List
          </Button>
        </Empty>
      )}
    </PageLayout>
  );
};

const StockBuildContent: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateJobActivity, invalidateJobs, invalidateProductUnits } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const enabledBaysQuery = useQuery(trpc.jobs.listJobBays.queryOptions({ filters: { isDisabled: false } }));
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const bayCalendars = useBayCalendars();
  // Schedule data is enrichment: when it fails the form still works, seeds just append.
  const scheduling = useMemo(
    () =>
      baysQuery.data && bayCalendars
        ? createBaySeedScheduling(baysQuery.data, bayCalendars.workingCalendarsByBayId)
        : null,
    [bayCalendars, baysQuery.data],
  );
  const createJobMutation = useMutation(
    trpc.jobs.create.mutationOptions({
      onSuccess: async (job) => {
        // Jobs first so the Board and list are fresh on arrival; the Unit it just minted follows.
        await Promise.all([invalidateJobs(), invalidateJobActivity()]);
        toast.success('Stock Build started');
        await navigate({ search: { job: job.id }, to: '/equipment/jobs/list' });
        await invalidateProductUnits();
      },
      onError: (error) => showMutationError(error, 'Unable to start stock build.'),
    }),
  );

  if (enabledBaysQuery.isLoading || baysQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <StockBuildForm
      baysError={enabledBaysQuery.error ?? baysQuery.error}
      enabledBays={enabledBaysQuery.data?.items ?? []}
      isPending={createJobMutation.isPending}
      onSubmit={(input) => createJobMutation.mutate(input)}
      scheduling={scheduling}
    />
  );
};

type StockBuildFormProps = {
  baysError: unknown;
  enabledBays: Bay[];
  isPending: boolean;
  onSubmit: (input: StockBuildCreateInput) => void;
  scheduling: BaySeedScheduling | null;
};

const StockBuildForm: React.FC<StockBuildFormProps> = ({ baysError, enabledBays, isPending, onSubmit, scheduling }) => {
  const trpc = useTRPC();
  const [showAllBays, setShowAllBays] = useState(true);
  const form = useAppForm({
    defaultValues: emptyStockBuildFormValues,
    validators: {
      onChange: StockBuildFormValues,
      onSubmit: StockBuildFormValues,
    },
    onSubmit: ({ value }) => {
      onSubmit(toStockBuildCreateInput(value));
    },
  });
  const productId = useStore(form.store, (state) => state.values.productId);
  // The picked Product's full catalog record: its Optional Assemblies are the Build Spec to choose
  // from, and its Product Bays are the Bay seeds, exactly as a Quote-sourced Job gets them.
  const productQuery = useQuery({
    ...trpc.products.get.queryOptions({ id: productId }),
    enabled: Boolean(productId),
  });
  const product = productQuery.data ?? null;
  const specedProductId = useRef('');

  useEffect(() => {
    if (specedProductId.current === (product?.id ?? '')) {
      return;
    }

    // A different machine is a different build: Assemblies belong to one Product's catalog, and the
    // previous Product's Bays describe the wrong work, so both are replaced rather than carried over.
    specedProductId.current = product?.id ?? '';
    form.setFieldValue('buildSpecAssemblyIds', []);
    form.setFieldValue('baySeeds', toStockBuildBaySeeds({ productBays: product?.productBays ?? [], scheduling }));
  }, [form, product, scheduling]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Build Spec</CardTitle>
          <CardDescription>
            The Product to build and the Optional Assemblies to fit. The CFO is snapshotted from this selection when the
            Job is created.
          </CardDescription>
        </CardHeader>
        <CardSeparator />
        <CardContent className="flex flex-col gap-4">
          <form.Field name="productId">
            {(field) => (
              <Field className="max-w-md">
                <FieldLabel htmlFor="stock-build-product">Product</FieldLabel>
                <StockBuildProductCombobox
                  disabled={isPending}
                  onSelected={(nextProductId) => field.handleChange(nextProductId)}
                  value={field.state.value}
                />
              </Field>
            )}
          </form.Field>
          <ErrorMessage error={productQuery.error} fallbackMessage="Unable to load the product catalog." />
          {productId && productQuery.isPending ? <Skeleton className="h-32 w-full" /> : null}
          {product ? (
            <form.Field name="buildSpecAssemblyIds">
              {(field) => (
                <StockBuildSpecSelector
                  catalogAssemblies={product.assemblies}
                  disabled={isPending}
                  onChange={(assemblyIds) => field.handleChange(assemblyIds)}
                  value={field.state.value}
                />
              )}
            </form.Field>
          ) : (
            <p className="text-muted-foreground text-sm">Pick a Product to spec the build.</p>
          )}
        </CardContent>
      </Card>
      <JobBaySeedsCard
        baysById={getBaySeedBayMap({ enabledBays, productBays: product?.productBays ?? [] })}
        baysError={baysError}
        enabledBays={enabledBays}
        fields={{ baySeeds: 'baySeeds' }}
        form={form}
        isPending={isPending}
        onShowAllBaysChange={setShowAllBays}
        scheduling={scheduling}
        showAllBays={showAllBays}
        showAllBaysInputId="stock-build-show-all-bays"
      />
      <form.Subscribe selector={(state) => state.values.baySeeds}>
        {(baySeeds) =>
          showAllBays || baySeeds.length > 0 ? (
            <BoardGantt
              embedded
              ghostLabel="Stock"
              ghostSeeds={baySeeds}
              visibleBayIds={showAllBays ? undefined : baySeeds.map((row) => row.bayId)}
            />
          ) : null
        }
      </form.Subscribe>
      <form.Subscribe selector={(state) => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting })}>
        {({ canSubmit, isSubmitting }) => (
          <div className="flex items-center justify-end gap-2">
            <Button disabled={isPending} render={<Link to="/equipment/jobs/list" />} variant="outline">
              Cancel
            </Button>
            <Button disabled={isPending || isSubmitting || !canSubmit} type="submit">
              {isPending || isSubmitting ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
              Start Stock Build
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
};

const getProductLabel = (product: ProductOption) => product.name;

const renderProductComboboxItem = (product: ProductOption) => (
  <span className="flex min-w-0 flex-col">
    <span className="truncate">{product.name}</span>
    <span className="truncate text-xs text-muted-foreground">{product.modelCode}</span>
  </span>
);

/**
 * The Product picker for a Stock Build. It reads the Product catalog directly rather than the
 * quote-scoped picker: nothing here is a sale, so range filtering and historical products do not apply.
 */
const StockBuildProductCombobox: React.FC<{
  disabled: boolean;
  onSelected: (productId: string) => void;
  value: string;
}> = ({ disabled, onSelected, value }) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const products = useProductOptions({ limit: 20, search: debouncedSearch, value });
  const valueProduct = products.itemsWithSelected.find((product) => product.id === value) ?? null;

  return (
    <EntityCombobox
      disabled={disabled}
      emptyMessage="No products found"
      inputId="stock-build-product"
      inputValue={search}
      isFetching={products.isFetching}
      itemToLabel={getProductLabel}
      onInputValueChange={setSearch}
      onSelected={(product) => {
        onSelected(product?.id ?? '');
        setSearch('');
      }}
      options={products.itemsWithSelected}
      placeholder="Search products"
      renderItem={renderProductComboboxItem}
      searchPlaceholder="Searching products..."
      value={valueProduct}
    />
  );
};
