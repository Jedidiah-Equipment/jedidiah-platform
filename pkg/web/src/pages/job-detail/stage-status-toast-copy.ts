import { jobStageStatusLabels } from '@pkg/domain';
import type { JobStageName, JobStageStatus } from '@pkg/schema';
import { getStageStatusChangeCopy } from './components/workflow-history-copy.js';
import { stageLabels } from './constants.js';

type StageStatusToastCopyInput = {
  fromStatus: JobStageStatus | null | undefined;
  stage: JobStageName;
  toStatus: JobStageStatus;
};

type StageStatusToastCopy = {
  description: string;
  title: string;
};

export function getStageStatusToastCopy(input: StageStatusToastCopyInput): StageStatusToastCopy {
  const stageLabel = stageLabels[input.stage];
  const nextStatusLabel = jobStageStatusLabels[input.toStatus];

  if (!input.fromStatus) {
    return {
      description: `${stageLabel} is now showing ${nextStatusLabel}.`,
      title: `${stageLabel} moved to ${nextStatusLabel}`,
    };
  }

  const previousStatusLabel = jobStageStatusLabels[input.fromStatus];

  if (input.fromStatus === input.toStatus) {
    return {
      description: `${stageLabel} is still showing ${nextStatusLabel}.`,
      title: `${stageLabel} stayed on ${nextStatusLabel}`,
    };
  }

  return {
    description: `${stageLabel} changed from ${previousStatusLabel} to ${nextStatusLabel}.`,
    title: getStageStatusChangeCopy({
      fromStatus: input.fromStatus,
      stage: input.stage,
      toStatus: input.toStatus,
    }).label,
  };
}
