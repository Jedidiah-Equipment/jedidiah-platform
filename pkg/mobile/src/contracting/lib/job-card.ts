import { DOCUMENT_PDF_CONTENT_TYPE } from '@pkg/domain';
import { jobCardFilename } from '@pkg/domain/contracting';
import type { JobCardVariant } from '@pkg/schema/contracting';
import type { DocumentAction } from '@/lib/document-actions';

/** The share sheet is how a Job Card reaches WhatsApp or email; the app itself never sends it. */
export function jobCardShareAction(jobNumber: string, variant: JobCardVariant): DocumentAction {
  return {
    path: `/api/contracting/jobs/${encodeURIComponent(jobNumber)}/job-card?variant=${variant}`,
    contentType: DOCUMENT_PDF_CONTENT_TYPE,
    filename: jobCardFilename(jobNumber, variant),
    cacheKey: jobNumber,
  };
}
