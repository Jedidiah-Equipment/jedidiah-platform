import { useNavigate } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import type React from 'react';

import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { PartTable } from './components/PartTable.js';
import { PartBulkImportDialog } from './PartBulkImportDialog.js';

export const PartsPage: React.FC = () => {
  const navigate = useNavigate();
  const canUpdatePart = useCan('part:update').can;

  return (
    <ListPageLayout
      action={
        canUpdatePart ? (
          <div className="flex gap-2">
            <PartBulkImportDialog />
            <Button onClick={() => navigate({ to: '/parts/new' })}>
              <PlusIcon data-icon="inline-start" />
              New part
            </Button>
          </div>
        ) : null
      }
      description="Inventory"
      title="Parts"
    >
      <PartTable
        onEditPart={canUpdatePart ? (part) => navigate({ to: '/parts/$id/edit', params: { id: part.id } }) : undefined}
        showEditActions={canUpdatePart}
      />
    </ListPageLayout>
  );
};
