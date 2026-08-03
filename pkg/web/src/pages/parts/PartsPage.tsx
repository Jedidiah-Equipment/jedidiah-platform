import type { Part } from '@pkg/schema';
import type React from 'react';
import { useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { partsPageDescription } from '@/utils/page-descriptions.js';
import { PartTable } from './components/PartTable.js';
import { PartBulkImportDialog } from './PartBulkImportDialog.js';
import { PartEditDialog } from './PartEditDialog.js';
import { PartLabelBatchDialog } from './PartLabelBatchDialog.js';
import { PartListCreateDialog } from './PartListCreateDialog.js';

export const PartsPage: React.FC = () => {
  const canUpdatePart = useCan('part:update').can;
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <PageLayout description={partsPageDescription} size="lg" title="Parts">
      <PartTable
        onEditPart={canUpdatePart ? setEditingPart : undefined}
        rightSection={
          <div className="flex flex-wrap gap-2">
            {canUpdatePart ? <PartBulkImportDialog buttonSize="sm" /> : null}
            {canUpdatePart ? (
              <Button onClick={() => setIsCreateDialogOpen(true)} size="sm">
                New part
              </Button>
            ) : null}
            <PartLabelBatchDialog buttonSize="sm" />
          </div>
        }
      />
      {editingPart ? (
        <PartEditDialog onClose={() => setEditingPart(null)} part={editingPart} supplier={editingPart.supplier} />
      ) : null}
      {canUpdatePart ? (
        <PartListCreateDialog
          onCreated={setEditingPart}
          onOpenChange={setIsCreateDialogOpen}
          open={isCreateDialogOpen}
        />
      ) : null}
    </PageLayout>
  );
};
