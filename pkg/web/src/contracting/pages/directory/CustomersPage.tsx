import type { Customer } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { useCreateEntityFlow } from '@/components/form/hooks/use-create-entity-flow.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { CustomerCreateValues } from './types.js';

export function CustomersPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateDirectory } = useQueryInvalidation();
  const canEdit = useCan('contracting_directory:update').can;
  const query = useQuery(trpc.contractingDirectory.customers.list.queryOptions());
  const flow = useCreateEntityFlow({
    mutation: trpc.contractingDirectory.customers.create.mutationOptions(),
    errorMessage: 'Unable to create customer.',
    invalidate: invalidateDirectory,
    navigateTo: (row) => ({ to: '/contracting/customers/$id/edit', params: { id: row.id } }),
  });
  const columns = useMemo<DataTableColumnDef<Customer>[]>(
    () => [
      { accessorKey: 'name', header: 'Name', enableSorting: true },
      { accessorKey: 'contactName', header: 'Contact name' },
      { accessorKey: 'phone', header: 'Phone' },
      { accessorKey: 'email', header: 'Email' },
    ],
    [],
  );
  return (
    <>
      <PageLayout
        title="Customers"
        description="Contracting customers and their Farms."
        size="lg"
        actions={canEdit ? <Button onClick={flow.open}>New customer</Button> : undefined}
      >
        <ErrorMessage error={query.error} fallbackMessage="Unable to load customers." />
        <ClientDataTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          emptyMessage="No entries found."
          searchPlaceholder="Search customers…"
          onOpen={(row) => void navigate({ to: '/contracting/customers/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <CreateEntityDialog
        {...flow.dialogProps}
        title="New customer"
        defaultValues={{ name: '' }}
        validator={CustomerCreateValues}
        onCreate={flow.create}
      >
        {(form) => <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>}
      </CreateEntityDialog>
    </>
  );
}
