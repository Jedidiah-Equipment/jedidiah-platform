import type React from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { catalogTranslationsPageDescription } from '@/utils/page-descriptions.js';

import { CatalogTranslationHealth } from './CatalogTranslationHealth.js';

export const CatalogTranslationsPage: React.FC = () => (
  <PageLayout description={catalogTranslationsPageDescription} size="lg" title="Translations">
    <CatalogTranslationHealth />
  </PageLayout>
);
