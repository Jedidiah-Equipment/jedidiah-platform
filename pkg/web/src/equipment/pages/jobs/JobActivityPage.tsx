import { useDebouncedValue } from '@mantine/hooks';
import { jobActivityFilterLabels } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import type { JobActivityFilter } from '@pkg/schema/equipment';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';

import { ActivityFilterTabs, ActivitySearch } from '@/components/activity/ActivityFeedControls.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { jobActivityPageDescription } from '@/equipment/utils/page-descriptions.js';

import { JobActivityFeed } from './components/JobActivityFeed.js';
import { JobSheet } from './components/JobSheet.js';

export const JobActivityPage: React.FC<{ selectedJobId?: UUID | undefined }> = ({ selectedJobId }) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<JobActivityFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search.trim(), 250);

  return (
    <PageLayout
      actions={
        <ActivitySearch
          onChange={setSearch}
          placeholder="Search text, people, Jobs, POs, Suppliers, Products or Customers…"
          value={search}
        />
      }
      description={jobActivityPageDescription}
      size="md"
      title="Job Activity"
    >
      <div className="grid gap-6">
        <ActivityFilterTabs labels={jobActivityFilterLabels} onChange={setFilter} value={filter} />
        <JobActivityFeed filter={filter} search={debouncedSearch} trackGlobalView />
      </div>
      {selectedJobId ? (
        <JobSheet
          key={selectedJobId}
          jobId={selectedJobId}
          onClose={() => navigate({ search: {}, to: '/equipment/jobs/activity' })}
        />
      ) : null}
    </PageLayout>
  );
};
