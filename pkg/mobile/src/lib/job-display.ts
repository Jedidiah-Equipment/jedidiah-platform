type JobDisplayFields = {
  code: string;
  productName: string | null;
  workTitle: string | null;
};

export function getJobDisplayName(job: JobDisplayFields): string {
  return job.productName ?? job.workTitle ?? job.code;
}
