import type { JobActivityFilter, UUID } from '@pkg/schema';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { jobActivityPageDescription } from '@/utils/page-descriptions.js';

import { JobActivityFeed } from './components/JobActivityFeed.js';
import { JobSheet } from './components/JobSheet.js';

const activityFilterLabels = {
  all: 'All',
  'user-feedback': 'User Feedback',
  'job-events': 'Job Events',
} as const satisfies Record<JobActivityFilter, string>;

export const JobActivityPage: React.FC<{ selectedJobId?: UUID | undefined }> = ({ selectedJobId }) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<JobActivityFilter>('all');

  return (
    <PageLayout
      actions={<JobActivityFilterSelect onValueChange={setFilter} value={filter} />}
      description={jobActivityPageDescription}
      size="md"
      title="Job Activity"
    >
      <JobActivityFeed filter={filter} />
      {selectedJobId ? (
        <JobSheet
          key={selectedJobId}
          jobId={selectedJobId}
          onClose={() => navigate({ search: {}, to: '/jobs/activity' })}
        />
      ) : null}
    </PageLayout>
  );
};

const JobActivityFilterSelect: React.FC<{
  onValueChange: (filter: JobActivityFilter) => void;
  value: JobActivityFilter;
}> = ({ onValueChange, value }) => (
  <Select onValueChange={(filter) => onValueChange(filter as JobActivityFilter)} value={value}>
    <SelectTrigger aria-label="Filter activity" className="w-40">
      <SelectValue>{activityFilterLabels[value]}</SelectValue>
    </SelectTrigger>
    <SelectContent align="end">
      {Object.entries(activityFilterLabels).map(([filter, label]) => (
        <SelectItem key={filter} value={filter}>
          {label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
