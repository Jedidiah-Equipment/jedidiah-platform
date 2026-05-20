import { jobStageStatusLabels } from '@pkg/domain';
import type { JOB_STAGE_STATUSES, JobStageName, JobStageStatus } from '@pkg/schema';

import { stageLabels } from '../constants.js';

type StageStatusChangeCopyInput = {
  fromStatus: JobStageStatus;
  stage: JobStageName;
  toStatus: JobStageStatus;
};

type StageStatusChangeCopy = {
  label: string;
  metadata: string;
};

type StageStatusFor<Stage extends JobStageName> = (typeof JOB_STAGE_STATUSES)[Stage][number];

type StageStatusChangeLabels = {
  [Stage in JobStageName]: Record<StageStatusFor<Stage>, string>;
};

const stageStatusChangeLabels = {
  assembly: {
    complete: 'Assembly completed',
    'in-progress': 'Assembly started',
    pending: 'Assembly waiting to start',
    qc: 'Assembly moved to QC',
  },
  dispatch: {
    complete: 'Job completed',
    dispatched: 'Job dispatched',
    pending: 'Dispatch waiting to start',
    ready: 'Dispatch is ready',
  },
  fabrication: {
    complete: 'Fabrication completed',
    cutting: 'Fabrication started cutting',
    pending: 'Fabrication waiting to start',
    qc: 'Fabrication moved to QC',
    welding: 'Fabrication started welding',
  },
  paint: {
    complete: 'Paint completed',
    curing: 'Paint started curing',
    painting: 'Paint started painting',
    pending: 'Paint waiting to start',
    prep: 'Paint moved into prep',
  },
  procurement: {
    complete: 'Procurement completed',
    ordering: 'Procurement started ordering',
    partial: 'Procurement partially received items',
    pending: 'Procurement waiting to start',
  },
} as const satisfies StageStatusChangeLabels;

const fromStatusMetadata = {
  complete: 'After the stage was completed',
  curing: 'After curing completed',
  cutting: 'After cutting completed',
  dispatched: 'After dispatch completed',
  'in-progress': 'After assembly work completed',
  ordering: 'After ordering completed',
  painting: 'After painting completed',
  partial: 'After items were partially received',
  pending: 'After the stage was queued',
  prep: 'After prep completed',
  qc: 'After QC completed',
  ready: 'After dispatch was marked ready',
  welding: 'After welding completed',
} as const satisfies Record<JobStageStatus, string>;

export function getStageStatusChangeCopy(input: StageStatusChangeCopyInput): StageStatusChangeCopy {
  return {
    label: getStageStatusChangeLabel(input),
    metadata: fromStatusMetadata[input.fromStatus],
  };
}

function getStageStatusChangeLabel(input: StageStatusChangeCopyInput): string {
  const labels = stageStatusChangeLabels[input.stage] as Partial<Record<JobStageStatus, string>>;

  return labels[input.toStatus] ?? `${stageLabels[input.stage]} moved to ${jobStageStatusLabels[input.toStatus]}`;
}
