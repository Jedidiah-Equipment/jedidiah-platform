import type { Db } from '@pkg/db';
import {
  buildJobCardModel,
  hasJobCard,
  type JobActor,
  jobCardFilename,
  jobReadMode,
  jobReadSeesMoney,
} from '@pkg/domain/contracting';
import type { JobCardPdfRenderer, JobCardVariant } from '@pkg/schema/contracting';
import { JobError, wrongStatus } from './job-errors.js';
import { getReadableJob } from './job-read.js';

/** Renders a Job's Job Card on demand; nothing is stored, so it always reflects the Job as it stands. */
export async function renderJobCard({
  db,
  actor,
  code,
  variant,
  pdfRenderer,
  now = new Date(),
}: {
  db: Db;
  actor: JobActor;
  code: string;
  variant: JobCardVariant;
  pdfRenderer: JobCardPdfRenderer;
  now?: Date;
}) {
  const mode = jobReadMode(actor);
  if (mode && !jobReadSeesMoney(mode))
    throw new JobError('contracting_job.forbidden', 'Foremen do not have access to Job Cards.');
  const job = await getReadableJob({ db, actor, code });
  if (!hasJobCard(job.status)) throw wrongStatus('A Job Card exists once the Job is Completed.');
  const document = buildJobCardModel(job, variant, now);
  return { bytes: await pdfRenderer({ document }), filename: jobCardFilename(job.jobNumber, variant) };
}
