import type { Part } from '@pkg/schema';
import { IconPlus } from '@tabler/icons-react';
import type React from 'react';
import { useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { partsPageDescription } from '@/equipment/utils/page-descriptions.js';
import { useCan } from '@/hooks/use-access.js';
import { PartTable } from './components/PartTable.js';
import { PartBulkExportButton } from './PartBulkExportButton.js';
import { PartBulkImportDialog } from './PartBulkImportDialog.js';
import { PartEditDialog } from './PartEditDialog.js';
import { PartLabelBatchDialog } from './PartLabelBatchDialog.js';
import { PartListCreateDialog } from './PartListCreateDialog.js';

export const PartsPage: React.FC = () => {
  const canUpdatePart = useCan('equipment_part:update').can;
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  return (
    <PageLayout
      actions={
        <div className="flex gap-2">
          <PartBulkExportButton />
          {canUpdatePart ? <PartBulkImportDialog /> : null}
          <PartLabelBatchDialog />
          {canUpdatePart ? (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <IconPlus data-icon="inline-start" />
              New part
            </Button>
          ) : null}
        </div>
      }
      description={partsPageDescription}
      size="full"
      title="Parts"
    >
      <PartTable onEditPart={canUpdatePart ? setEditingPart : undefined} />
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
