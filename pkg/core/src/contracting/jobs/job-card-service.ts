import type { Db } from '@pkg/db';
import { buildJobCardModel, hasJobCard, jobCardFilename, jobReadSeesMoney } from '@pkg/domain/contracting';
import type { JobCardPdfRenderer, JobCardVariant } from '@pkg/schema/contracting';
import { JobError, wrongStatus } from './job-errors.js';
import { getReadableJob, type JobReader } from './job-read.js';

/** Renders a Job's Job Card on demand; nothing is stored, so it always reflects the Job as it stands. */
export async function renderJobCard({
  db,
  reader,
  code,
  variant,
  pdfRenderer,
  now = new Date(),
}: {
  db: Db;
  reader: JobReader;
  code: string;
  variant: JobCardVariant;
  pdfRenderer: JobCardPdfRenderer;
  now?: Date;
}) {
  if (!jobReadSeesMoney(reader.mode))
    throw new JobError('contracting_job.forbidden', 'Foremen do not have access to Job Cards.');
  const job = await getReadableJob({ db, reader, code });
  if (!hasJobCard(job.status)) throw wrongStatus('A Job Card exists once the Job is Completed.');
  const document = buildJobCardModel(job, variant, now);
  return { bytes: await pdfRenderer({ document }), filename: jobCardFilename(job.jobNumber, variant) };
}
