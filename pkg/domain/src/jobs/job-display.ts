import { quoteKindLabels } from '../quotes/quote-display.js';

export type JobDisplaySource = {
  code: string;
  productName: string | null;
  /** Null on a Stock Build, which has no Quote — it still builds a Product, so it reads as one. */
  quoteKind: 'product' | 'custom' | null;
  workTitle: string | null;
};

export type JobDisplaySubtitleSource = JobDisplaySource & {
  productModelCode: string | null;
};

export type JobOptionHintSource = JobDisplaySource & {
  /** Null on a Custom Job, which builds no machine and so falls back to its display name. */
  productUnit: { productSerialNumber: string } | null;
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
    return { mono: false, text: quoteKindLabels.custom };
  }

  return job.productModelCode ? { mono: true, text: job.productModelCode } : null;
}

export function getJobOptionHint(job: JobOptionHintSource): string {
  return job.productUnit?.productSerialNumber ?? getJobDisplayName(job);
}

/**
 * How a Job reads when it is named as something else's subject — its code, then the hint that tells
 * two Jobs apart. `code` is already the formatted Job Code.
 */
export function getJobCodeWithHint(job: JobOptionHintSource): string {
  return `${job.code} · ${getJobOptionHint(job)}`;
}

/** The Quote kind a Job presents as, so Job surfaces can reuse the Quote kind palette. */
export function getJobOfferingKind(job: Pick<JobDisplaySource, 'quoteKind'>): 'product' | 'custom' {
  return job.quoteKind === 'custom' ? 'custom' : 'product';
}

export function getJobWorkLabel(job: Pick<JobDisplaySource, 'quoteKind'>): 'Product' | 'Work title' {
  return getJobOfferingKind(job) === 'custom' ? 'Work title' : 'Product';
}
