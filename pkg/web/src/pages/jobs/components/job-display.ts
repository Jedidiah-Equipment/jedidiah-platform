type JobDisplaySource = {
  code: string;
  productModelCode?: string | null;
  productName?: string | null;
  productSerialNumber?: string | null;
  quoteKind?: 'product' | 'custom';
  workTitle?: string | null;
};

export function getJobDisplayName(job: JobDisplaySource): string {
  return job.productName ?? job.workTitle ?? job.code;
}

export function getJobDisplaySubtitle(job: JobDisplaySource): string | null {
  return job.productModelCode ?? (job.quoteKind === 'custom' ? 'Custom work' : null);
}

export function getJobOptionHint(job: JobDisplaySource): string {
  return job.productSerialNumber ?? getJobDisplayName(job);
}
