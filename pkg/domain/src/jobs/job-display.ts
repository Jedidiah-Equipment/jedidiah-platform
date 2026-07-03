export type JobDisplaySource = {
  code: string;
  productName: string | null;
  quoteKind: 'product' | 'custom';
  workTitle: string | null;
};

export type JobDisplaySubtitleSource = JobDisplaySource & {
  productModelCode: string | null;
};

export type JobOptionHintSource = JobDisplaySource & {
  productSerialNumber: string | null;
};

export type JobDisplaySubtitle = {
  text: string;
  mono: boolean;
};

export function getJobDisplayName(job: JobDisplaySource): string {
  return job.quoteKind === 'custom' ? (job.workTitle ?? job.code) : (job.productName ?? job.code);
}

export function getJobDisplayNameWithModel(job: JobDisplaySubtitleSource): string {
  const displayName = getJobDisplayName(job);

  return job.productModelCode ? `${displayName} (${job.productModelCode})` : displayName;
}

export function getJobDisplaySubtitle(job: JobDisplaySubtitleSource): JobDisplaySubtitle | null {
  if (job.quoteKind === 'custom') {
    return { mono: false, text: 'Custom work' };
  }

  return job.productModelCode ? { mono: true, text: job.productModelCode } : null;
}

export function getJobOptionHint(job: JobOptionHintSource): string {
  return job.productSerialNumber ?? getJobDisplayName(job);
}

export function getJobWorkLabel(job: Pick<JobDisplaySource, 'quoteKind'>): 'Product' | 'Work title' {
  return job.quoteKind === 'custom' ? 'Work title' : 'Product';
}
