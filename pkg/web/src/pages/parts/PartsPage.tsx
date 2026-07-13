import type { Part } from '@pkg/schema';
import type React from 'react';
import { useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useCan } from '@/hooks/use-access.js';
import { partsPageDescription } from '@/utils/page-descriptions.js';
import { PartTable } from './components/PartTable.js';
import { PartEditDialog } from './PartEditDialog.js';

export const PartsPage: React.FC = () => {
  const canUpdatePart = useCan('part:update').can;
  const [editingPart, setEditingPart] = useState<Part | null>(null);

  return (
    <PageLayout description={partsPageDescription} size="lg" title="Parts">
      <PartTable onEditPart={canUpdatePart ? setEditingPart : undefined} />
      {editingPart ? (
        <PartEditDialog onClose={() => setEditingPart(null)} part={editingPart} supplier={editingPart.supplier} />
      ) : null}
    </PageLayout>
  );
};
