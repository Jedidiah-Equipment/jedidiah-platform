import { useNavigate } from '@tanstack/react-router';
import type React from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { unitsPageDescription } from '@/utils/page-descriptions.js';
import { ProductUnitTable } from './components/ProductUnitTable.js';

export const UnitsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageLayout description={unitsPageDescription} size="lg" title="Units">
      <ProductUnitTable onOpenUnit={(unit) => navigate({ to: '/units/$id', params: { id: unit.id } })} />
    </PageLayout>
  );
};
