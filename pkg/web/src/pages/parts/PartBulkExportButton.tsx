import type { Supplier } from '@pkg/schema';
import { IconDownload, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type React from 'react';

import { Button, type ButtonSize } from '@/components/ui/button.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { downloadPartBulkExport } from './part-bulk-csv.js';

type PartBulkExportButtonProps = {
  supplier?: Pick<Supplier, 'companyName' | 'id'>;
  buttonSize?: ButtonSize;
};

/**
 * The other half of the bulk import: the same columns, in the same order, so the file this hands out
 * is one the import next door reads back.
 */
export const PartBulkExportButton: React.FC<PartBulkExportButtonProps> = ({ supplier, buttonSize = 'default' }) => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();

  const exportMutation = useMutation({
    mutationFn: () =>
      queryClient.fetchQuery(trpc.parts.bulkExport.queryOptions(supplier ? { supplierId: supplier.id } : {})),
    onError: (error) => showMutationError(error, 'Unable to export parts.'),
    onSuccess: (rows) => downloadPartBulkExport(rows, supplier?.companyName),
  });

  return (
    <Button
      disabled={exportMutation.isPending}
      onClick={() => exportMutation.mutate()}
      size={buttonSize}
      variant="outline"
    >
      {exportMutation.isPending ? (
        <IconLoader2 className="animate-spin" data-icon="inline-start" />
      ) : (
        <IconDownload data-icon="inline-start" />
      )}
      Bulk parts export
    </Button>
  );
};
