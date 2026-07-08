import type { UUID } from '@pkg/schema';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { baySchedulePageDescription } from '@/utils/page-descriptions.js';
import { BoardGantt } from './components/BoardGantt.js';
import { BookSlotDialog } from './components/BookSlotDialog.js';
import { JobSheet } from './components/JobSheet.js';

type JobsPageProps = {
  selectedJobId?: UUID | undefined;
};

export const JobsPage: React.FC<JobsPageProps> = ({ selectedJobId }) => {
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <PageLayout
      actions={<BookSlotDialog />}
      description={baySchedulePageDescription}
      fullscreen={isFullscreen}
      onFullscreenChange={setIsFullscreen}
      size="full"
      title="Jobs"
    >
      <BoardGantt
        fullscreen={isFullscreen}
        onFullscreenChange={setIsFullscreen}
        onSelectSlot={(jobId) => navigate({ search: { job: jobId }, to: '/jobs' })}
      />
      {selectedJobId ? (
        <JobSheet key={selectedJobId} jobId={selectedJobId} onClose={() => navigate({ search: {}, to: '/jobs' })} />
      ) : null}
    </PageLayout>
  );
};
