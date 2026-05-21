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

type StageStartedCopyInput = {
  stage: JobStageName;
};

export function getStageStatusChangeCopy(input: StageStatusChangeCopyInput): StageStatusChangeCopy {
  return {
    label: `${stageLabels[input.stage]} moved to ${jobStageStatusLabels[input.toStatus]}`,
    metadata: `Previously ${jobStageStatusLabels[input.fromStatus]}`,
  };
}

export function getStageStartedMetadata(input: StageStartedCopyInput): string {
  return `${stageLabels[input.stage]} is now active`;
}
