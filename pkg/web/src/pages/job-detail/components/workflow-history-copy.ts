import { jobStageStatusLabels } from '@pkg/domain';
import type { JobStageName, JobStageStatus } from '@pkg/schema';

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

const stageStatusChangeLabels: Record<JobStageName, Partial<Record<JobStageStatus, string>>> = {
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
};

const completedStatusPhrases = {
  complete: 'completion',
  curing: 'curing',
  cutting: 'cutting',
  dispatched: 'dispatch',
  'in-progress': 'assembly work',
  ordering: 'ordering',
  painting: 'painting',
  partial: 'partial receipt',
  pending: 'waiting to start',
  prep: 'prep',
  qc: 'QC',
  ready: 'dispatch readiness',
  welding: 'welding',
} as const satisfies Record<JobStageStatus, string>;

export function getStageStatusChangeCopy(input: StageStatusChangeCopyInput): StageStatusChangeCopy {
  return {
    label:
      stageStatusChangeLabels[input.stage][input.toStatus] ??
      `${stageLabels[input.stage]} moved to ${jobStageStatusLabels[input.toStatus]}`,
    metadata: `After ${completedStatusPhrases[input.fromStatus]} completed`,
  };
}
