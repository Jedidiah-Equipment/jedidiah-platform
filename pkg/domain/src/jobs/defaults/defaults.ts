import type { JobStageName } from '@pkg/schema';

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
  plannedEnd?: Date | null;
  plannedStart?: Date | null;
};

export type PipelineDefaultsInput = {
  anchor: PipelineDefaultsAnchor;
  pinnedWindow?: PipelineDefaultsPinnedWindow;
  productPerDeptConfig: readonly ProductPerDeptConfig[];
};

export type PipelineDefaultStage = {
  plannedEnd: Date;
  plannedStart: Date;
  durationDays: number;
  stage: JobStageName;
};

export type PipelineDefaultStationBooking = {
  plannedEnd: Date;
  plannedStart: Date;
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
  const stages = buildAnchoredStages({ anchor: input.anchor, configs: orderedConfigs });
  const stationBookings = stages.flatMap((stage) =>
    (orderedConfigs.find((config) => config.stage === stage.stage)?.defaultStationIds ?? []).map((stationId) => ({
      plannedEnd: cloneDate(stage.plannedEnd),
      plannedStart: cloneDate(stage.plannedStart),
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

function buildAnchoredStages({
  anchor,
  configs,
}: {
  anchor: PipelineDefaultsAnchor;
  configs: readonly ProductPerDeptConfig[];
}): PipelineDefaultStage[] {
  const totalDurationDays = configs.reduce((total, config) => total + config.durationDays, 0);
  let cursor = anchor.kind === 'start' ? cloneDate(anchor.value) : addDays(anchor.value, -totalDurationDays);

  return configs.map((config) => {
    const plannedStart = cloneDate(cursor);
    const plannedEnd = addDays(plannedStart, config.durationDays);
    cursor = cloneDate(plannedEnd);

    return {
      durationDays: config.durationDays,
      plannedEnd,
      plannedStart,
      stage: config.stage,
    };
  });
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
  if (!pinnedWindow?.plannedStart || !pinnedWindow.plannedEnd) return null;

  // Pinned window values are UTC date-only values, matching the creation-anchor date contract.
  const windowDays = getWholeDayDelta(pinnedWindow.plannedStart, pinnedWindow.plannedEnd);
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

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MILLISECONDS_PER_DAY);
}
