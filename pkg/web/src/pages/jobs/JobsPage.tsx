import type { UUID } from '@pkg/schema';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { baySchedulePageDescription } from '@/utils/page-descriptions.js';
import { BayScheduleGantt } from './components/BayScheduleGantt.js';
import { BookSlotDialog } from './components/BookSlotDialog.js';
import { JobDetailAside } from './components/JobDetailAside.js';

type JobsPageProps = {
  selectedBayId?: UUID | undefined;
  selectedJobId?: UUID | undefined;
};

export const JobsPage: React.FC<JobsPageProps> = ({ selectedBayId, selectedJobId }) => {
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <PageLayout
      actions={<BookSlotDialog />}
      aside={
        selectedJobId ? (
          <JobDetailAside
            bayId={selectedBayId}
            jobId={selectedJobId}
            onClose={() => navigate({ search: {}, to: '/jobs' })}
          />
        ) : undefined
      }
      description={baySchedulePageDescription}
      fullscreen={isFullscreen}
      onFullscreenChange={setIsFullscreen}
      size="full"
      title="Jobs"
    >
      <BayScheduleGantt
        fullscreen={isFullscreen}
        onFullscreenChange={setIsFullscreen}
        onSelectSlot={(jobId, bayId) => navigate({ search: { bay: bayId, job: jobId }, to: '/jobs' })}
      />
    </PageLayout>
  );
};
