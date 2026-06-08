import type { BayCalendarException, BayCalendarExceptionDirection, OffDay } from '@pkg/schema';

export type SelectedCalendarDay = {
  date: Date;
  offDay: OffDay | null;
};

export type BayExceptionDialogState = {
  bayId: string;
  date: string;
  direction: BayCalendarExceptionDirection;
  existingException: BayCalendarException | null;
  label: string;
};

export type BayExceptionChip = {
  bayId: string;
  bayName: string;
  date: string;
  direction: BayCalendarExceptionDirection;
  label: string | null;
};
