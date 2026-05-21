import type { JobStageName } from '@pkg/schema';

import { stageLabels } from '../constants.js';

type StageStartedCopyInput = {
  stage: JobStageName;
};

export function getStageStartedMetadata(input: StageStartedCopyInput): string {
  return `${stageLabels[input.stage]} is now active`;
}
