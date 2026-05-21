import type { JobStageName } from '@pkg/schema';

import { cascadeDown } from '../dates/index.js';
import { JOB_STAGE_PIPELINE } from '../job-stage-pipeline.js';

export type PipelineDefaultsAnchor = {
  kind: 'start' | 'end';
  value: Date;
};

export type ProductPerDeptConfig = {
  defaultStationIds: readonly string[];
  durationDays: number;
  stage: JobStageName;
};

export type PipelineDefaultsPinnedWindow = {
  dueEnd?: Date | null;
  dueStart?: Date | null;
};

export type PipelineDefaultsInput = {
  anchor: PipelineDefaultsAnchor;
  pinnedWindow?: PipelineDefaultsPinnedWindow;
  productPerDeptConfig: readonly ProductPerDeptConfig[];
};

export type PipelineDefaultStage = {
  dueEnd: Date;
  dueStart: Date;
  durationDays: number;
  stage: JobStageName;
};

export type PipelineDefaultStationBooking = {
  dueEnd: Date;
  dueStart: Date;
  stage: JobStageName;
  stationId: string;
};

export type PipelineDefaultsWarning = {
  kind: 'infeasible-window';
  message: string;
  totalDurationDays: number;
  windowDays: number;
};

export type PipelineDefaultsResult = {
  /** Stages remain anchored to the requested input; callers should surface warning before persisting infeasible schedules. */
  stages: PipelineDefaultStage[];
  stationBookings: PipelineDefaultStationBooking[];
  warning: PipelineDefaultsWarning | null;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeDefaults(input: PipelineDefaultsInput): PipelineDefaultsResult {
  const orderedConfigs = orderProductConfig(input.productPerDeptConfig);
  const stages = cascadeDown({
    anchor: input.anchor,
    currentLevels: [],
    durations: orderedConfigs.map((config) => ({
      durationDays: config.durationDays,
      key: config.stage,
    })),
    mode: 'create',
  }).map((stageDates) => {
    const config = orderedConfigs.find((item) => item.stage === stageDates.key);
    // Create-mode cascades generate complete windows; this guard keeps the type narrow if that contract changes.
    if (!config || !stageDates.dueStart || !stageDates.dueEnd) {
      throw new Error(`Missing default window for ${stageDates.key}.`);
    }

    return {
      dueEnd: stageDates.dueEnd,
      dueStart: stageDates.dueStart,
      durationDays: config.durationDays,
      stage: stageDates.key,
    };
  });
  const stationBookings = stages.flatMap((stage) =>
    (orderedConfigs.find((config) => config.stage === stage.stage)?.defaultStationIds ?? []).map((stationId) => ({
      dueEnd: cloneDate(stage.dueEnd),
      dueStart: cloneDate(stage.dueStart),
      stage: stage.stage,
      stationId,
    })),
  );

  return {
    stages,
    stationBookings,
    warning: getInfeasibleWindowWarning(input.pinnedWindow, orderedConfigs),
  };
}

function orderProductConfig(configs: readonly ProductPerDeptConfig[]): ProductPerDeptConfig[] {
  const byStage = new Map(configs.map((config) => [config.stage, config]));

  // Pipeline defaults intentionally ignore valid stages until they are added to the advisory pipeline order.
  return JOB_STAGE_PIPELINE.map(({ stage }) => {
    const config = byStage.get(stage);

    return {
      defaultStationIds: config?.defaultStationIds ?? [],
      durationDays: config?.durationDays ?? 0,
      stage,
    };
  });
}

function getInfeasibleWindowWarning(
  pinnedWindow: PipelineDefaultsPinnedWindow | undefined,
  configs: readonly ProductPerDeptConfig[],
): PipelineDefaultsWarning | null {
  if (!pinnedWindow?.dueStart || !pinnedWindow.dueEnd) return null;

  // Pinned window values are UTC date-only values, matching the cascade-down due-date contract.
  const windowDays = getWholeDayDelta(pinnedWindow.dueStart, pinnedWindow.dueEnd);
  const totalDurationDays = configs.reduce((total, config) => total + config.durationDays, 0);
  if (totalDurationDays <= windowDays) return null;

  return {
    kind: 'infeasible-window',
    message: 'The configured stage durations exceed the pinned job window.',
    totalDurationDays,
    windowDays,
  };
}

function getWholeDayDelta(previousValue: Date, nextValue: Date): number {
  return Math.round((nextValue.getTime() - previousValue.getTime()) / MILLISECONDS_PER_DAY);
}

function cloneDate(date: Date): Date {
  return new Date(date.getTime());
}
