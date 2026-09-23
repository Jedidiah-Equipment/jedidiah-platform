import type { Db } from '@pkg/db';
import { buildJobCardModel, hasJobCard, jobCardFilename } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import type { JobCardPdfRenderer, JobCardVariant } from '@pkg/schema/contracting';
import { JobError, wrongStatus } from './job-errors.js';
import { getReadableJob } from './job-read.js';

/** Renders a Job's Job Card on demand; nothing is stored, so it always reflects the Job as it stands. */
export async function renderJobCard({
  db,
  actorUserId,
  mode,
  code,
  variant,
  pdfRenderer,
  now = new Date(),
}: {
  db: Db;
  actorUserId: AuthId;
  mode: 'all' | 'own' | 'priced';
  code: string;
  variant: JobCardVariant;
  pdfRenderer: JobCardPdfRenderer;
  now?: Date;
}) {
  if (mode === 'own') throw new JobError('contracting_job.invalid_role', 'Foremen do not have access to Job Cards.');
  const job = await getReadableJob({ db, actorUserId, mode, code });
  if (!hasJobCard(job.status)) throw wrongStatus('A Job Card exists once the Job is Completed.');
  const document = buildJobCardModel(job, variant, now);
  return { bytes: await pdfRenderer({ document }), filename: jobCardFilename(job.jobNumber, variant) };
}
