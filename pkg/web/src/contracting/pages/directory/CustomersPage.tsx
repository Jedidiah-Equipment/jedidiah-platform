import { type Customer, CustomerName } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { DirectoryTable } from './DirectoryTable.js';
import { useDirectoryInvalidation } from './use-directory-invalidation.js';

const CustomerCreateValues = z.object({ name: CustomerName });
export function CustomersPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const invalidate = useDirectoryInvalidation();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_directory:update').can;
  const [open, setOpen] = useState(false);
  const query = useQuery(trpc.contractingDirectory.customers.list.queryOptions());
  const create = useMutation(
    trpc.contractingDirectory.customers.create.mutationOptions({
      onError: (error) => showError(error, 'Unable to create customer.'),
    }),
  );
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
        actions={canEdit ? <Button onClick={() => setOpen(true)}>New customer</Button> : undefined}
      >
        <ErrorMessage error={query.error} fallbackMessage="Unable to load customers." />
        <DirectoryTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          searchPlaceholder="Search customers…"
          onOpen={(row) => void navigate({ to: '/contracting/customers/$id/edit', params: { id: row.id } })}
        />
      </PageLayout>
      <CreateEntityDialog
        key={open ? 'open' : 'closed'}
        open={open}
        onOpenChange={setOpen}
        title="New customer"
        defaultValues={{ name: '' }}
        validator={CustomerCreateValues}
        onCreate={(values) => create.mutateAsync(values)}
        onCreated={async (row) => {
          await invalidate();
          setOpen(false);
          await navigate({ to: '/contracting/customers/$id/edit', params: { id: row.id } });
        }}
      >
        {(form) => <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>}
      </CreateEntityDialog>
    </>
  );
}
