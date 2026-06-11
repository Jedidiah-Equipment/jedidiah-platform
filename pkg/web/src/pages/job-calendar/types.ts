import type { BayCalendarException, BayCalendarExceptionDirection, DateOnlyIso, OffDay } from '@pkg/schema';

export type SelectedCalendarDay = {
  date: Date;
  offDay: OffDay | null;
};

export type BayExceptionDialogState = {
  bayId: string;
  date: DateOnlyIso;
  direction: BayCalendarExceptionDirection;
  existingException: BayCalendarException | null;
  label: string;
};

export type BayExceptionChip = {
  bayId: string;
  bayName: string;
  date: DateOnlyIso;
  direction: BayCalendarExceptionDirection;
  label: string | null;
};
