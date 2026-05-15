import type { JobStageName, UUID } from '@pkg/schema';

export type JobStageTransitionInput = {
  id: UUID;
  stage: JobStageName;
};

export type JobTransitionConfirmation = {
  body: string[];
  confirmLabel: string;
  confirmVariant: 'default' | 'destructive' | 'outline';
  onConfirm: () => void;
  title: string;
};
