import { computeDefaults, departmentLabels, JOB_STAGE_PIPELINE } from '@pkg/domain';
import type { JobCreateInput, JobStageName, Product, UUID } from '@pkg/schema';
import { format, parse } from 'date-fns';

export type AnchorKind = 'start' | 'end';

export type StageDraft = {
  dueEnd: string;
  dueEndSetManually: boolean;
  dueStart: string;
  dueStartSetManually: boolean;
  stage: JobStageName;
  stationBookings: StationBookingDraft[];
};

export type StationBookingDraft = {
  dueEnd: string;
  dueEndSetManually: boolean;
  dueStart: string;
  dueStartSetManually: boolean;
  id: string;
  stationId: UUID;
};

export function createDefaultStages({
  anchorDate,
  anchorKind,
  createDraftId,
  product,
}: {
  anchorDate: string;
  anchorKind: AnchorKind;
  createDraftId: () => string;
  product: Product;
}): StageDraft[] {
  const result = computeDefaults({
    anchor: {
      kind: anchorKind,
      value: fromDateInputValue(anchorDate),
    },
    productPerDeptConfig: product.departmentConfigs.map((config) => ({
      defaultStationIds: config.defaultStationIds,
      durationDays: config.durationDays,
      stage: config.department,
    })),
  });

  return JOB_STAGE_PIPELINE.map(({ stage }) => {
    const defaultStage = result.stages.find((item) => item.stage === stage);
    if (!defaultStage) return createEmptyStage(stage);

    return {
      dueEnd: toDateInputValue(defaultStage.dueEnd),
      dueEndSetManually: false,
      dueStart: toDateInputValue(defaultStage.dueStart),
      dueStartSetManually: false,
      stage,
      stationBookings: result.stationBookings
        .filter((booking) => booking.stage === stage)
        .map((booking) => ({
          dueEnd: toDateInputValue(booking.dueEnd),
          dueEndSetManually: false,
          dueStart: toDateInputValue(booking.dueStart),
          dueStartSetManually: false,
          id: createDraftId(),
          stationId: booking.stationId,
        })),
    };
  });
}

export function mergeDefaultStages(currentStages: StageDraft[], defaultStages: StageDraft[]): StageDraft[] {
  return defaultStages.map((defaultStage) => {
    const currentStage = currentStages.find((stage) => stage.stage === defaultStage.stage);
    if (!currentStage) return defaultStage;

    return {
      ...defaultStage,
      dueEnd: currentStage.dueEndSetManually ? currentStage.dueEnd : defaultStage.dueEnd,
      dueEndSetManually: currentStage.dueEndSetManually,
      dueStart: currentStage.dueStartSetManually ? currentStage.dueStart : defaultStage.dueStart,
      dueStartSetManually: currentStage.dueStartSetManually,
      stationBookings: mergeDefaultBookings(currentStage, defaultStage),
    };
  });
}

export function mergeDefaultBookings(currentStage: StageDraft, defaultStage: StageDraft): StationBookingDraft[] {
  const currentByStationId = new Map(currentStage.stationBookings.map((booking) => [booking.stationId, booking]));
  const defaultStationIds = new Set(defaultStage.stationBookings.map((booking) => booking.stationId));

  return [
    ...defaultStage.stationBookings.map((defaultBooking) => {
      const currentBooking = currentByStationId.get(defaultBooking.stationId);
      if (!currentBooking) return defaultBooking;

      return {
        ...defaultBooking,
        dueEnd: currentBooking.dueEndSetManually ? currentBooking.dueEnd : defaultBooking.dueEnd,
        dueEndSetManually: currentBooking.dueEndSetManually,
        dueStart: currentBooking.dueStartSetManually ? currentBooking.dueStart : defaultBooking.dueStart,
        dueStartSetManually: currentBooking.dueStartSetManually,
        id: currentBooking.id,
      };
    }),
    ...currentStage.stationBookings
      .filter((currentBooking) => !defaultStationIds.has(currentBooking.stationId))
      .map((currentBooking) => ({
        ...currentBooking,
        dueEnd: currentBooking.dueEndSetManually ? currentBooking.dueEnd : defaultStage.dueEnd,
        dueStart: currentBooking.dueStartSetManually ? currentBooking.dueStart : defaultStage.dueStart,
      })),
  ];
}

export function buildCreateJobInput({
  dueDate,
  productId,
  quoteId,
  stages,
}: {
  dueDate: string;
  productId: UUID | '';
  quoteId: UUID | null;
  stages: StageDraft[];
}): JobCreateInput {
  if (!productId) {
    throw new Error('Product is required to create a job.');
  }

  return {
    dueDate: dueDate || null,
    productId,
    quoteId,
    stages: stages.map((stage) => ({
      stage: stage.stage,
      stationBookings: stage.stationBookings.map((booking) => ({
        dueEnd: booking.dueEnd || null,
        dueEndSetManually: booking.dueEndSetManually,
        dueStart: booking.dueStart || null,
        dueStartSetManually: booking.dueStartSetManually,
        stationId: booking.stationId,
      })),
    })),
  };
}

export function createEmptyStages(): StageDraft[] {
  return JOB_STAGE_PIPELINE.map(({ stage }) => createEmptyStage(stage));
}

export function createEmptyStage(stage: JobStageName): StageDraft {
  return {
    dueEnd: '',
    dueEndSetManually: false,
    dueStart: '',
    dueStartSetManually: false,
    stage,
    stationBookings: [],
  };
}

export function getUnconfiguredStages(product: Product): JobStageName[] {
  const configsByDepartment = new Map(product.departmentConfigs.map((config) => [config.department, config]));

  return JOB_STAGE_PIPELINE.flatMap(({ stage }) => {
    const config = configsByDepartment.get(stage);
    return !config || config.durationDays === 0 || config.defaultStationIds.length === 0 ? [stage] : [];
  });
}

export function getInfeasibleMessage(stages: StageDraft[]): string | null {
  const invertedStage = stages.find(
    (stage) => stage.dueStart && stage.dueEnd && stage.dueStart.localeCompare(stage.dueEnd) > 0,
  );
  if (invertedStage) {
    return `${departmentLabels[invertedStage.stage]} starts after it ends. You can still save, but the dates need attention.`;
  }

  return null;
}

export function formatStageList(stages: JobStageName[]): string {
  return stages.map((stage) => departmentLabels[stage]).join(', ');
}

export function fromDateInputValue(value: string): Date {
  return value ? parse(value, 'yyyy-MM-dd', new Date()) : new Date();
}

export function toDateInputValue(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
