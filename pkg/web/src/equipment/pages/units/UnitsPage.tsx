import { useNavigate } from '@tanstack/react-router';
import type React from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { unitsPageDescription } from '@/equipment/utils/page-descriptions.js';
import { ProductUnitTable } from './components/ProductUnitTable.js';

export const UnitsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ProductUnitTable
      onOpenUnit={(unit) => navigate({ to: '/equipment/units/$id', params: { id: unit.id } })}
      render={({ exportAction, tableContent }) => (
        <PageLayout actions={exportAction} description={unitsPageDescription} size="lg" title="Units">
          {tableContent}
        </PageLayout>
      )}
    />
  );
};
