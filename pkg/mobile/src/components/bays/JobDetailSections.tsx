import { JobAssemblies } from '@/components/bays/JobAssemblies';
import { JobDocuments } from '@/components/bays/JobDocuments';
import { FactCard, JobFactsCard } from '@/components/bays/job-facts';
import { JobFeedbackList } from '@/components/feedback/JobFeedbackList';
import { Text } from '@/components/ui/text';

type JobDetailSectionsProps = {
  customerCompanyName: string | null;
  description: string | null;
  jobCode: string;
  jobId: string;
  productSerialNumber: string | null;
  quoteCode: string;
  workName: string;
};

/** Shared Job cards for the standalone Job detail and Bay Slot detail panes. */
export function JobDetailSections({
  customerCompanyName,
  description,
  jobCode,
  jobId,
  productSerialNumber,
  quoteCode,
  workName,
}: JobDetailSectionsProps) {
  return (
    <>
      <JobFactsCard
        customerCompanyName={customerCompanyName}
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

      <JobFeedbackList jobCode={jobCode} jobId={jobId} />

      <JobDocuments jobId={jobId} />

      <JobAssemblies jobId={jobId} />
    </>
  );
}
