import { JobAssemblies } from '@/components/bays/JobAssemblies';
import { JobDocuments } from '@/components/bays/JobDocuments';
import { FactCard, JobFactsCard } from '@/components/bays/job-facts';
import { JobFeedbackList } from '@/components/feedback/JobFeedbackList';
import { Text } from '@/components/ui/text';

type JobDetailSectionsProps = {
  customerCompanyName: string | null;
  description: string | null;
  jobCode: string;
  /** Open JOB DETAILS on arrival, for a surface whose toolbar names something other than the Job. */
  jobFactsDefaultOpen?: boolean;
  jobId: string;
  productSerialNumber: string | null;
  quoteCode: string;
  showFeedback?: boolean;
  workName: string;
};

/** Shared Job cards for the standalone Job detail and Bay Slot detail panes. */
export function JobDetailSections({
  customerCompanyName,
  description,
  jobCode,
  jobFactsDefaultOpen = false,
  jobId,
  productSerialNumber,
  quoteCode,
  showFeedback = true,
  workName,
}: JobDetailSectionsProps) {
  return (
    <>
      <JobFactsCard
        customerCompanyName={customerCompanyName}
        defaultOpen={jobFactsDefaultOpen}
        jobCode={jobCode}
        workName={workName}
        productSerialNumber={productSerialNumber}
        quoteCode={quoteCode}
      />

      {description ? (
        <FactCard title="Description">
          <Text className="text-sm leading-5 text-surface-foreground">{description}</Text>
        </FactCard>
      ) : null}

      <JobDocuments jobId={jobId} />

      <JobAssemblies jobId={jobId} />

      {showFeedback ? <JobFeedbackList jobCode={jobCode} jobId={jobId} /> : null}
    </>
  );
}
