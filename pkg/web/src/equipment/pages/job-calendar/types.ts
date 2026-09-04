import type { DateOnlyIso } from '@pkg/schema';
import type { BayCalendarException, BayCalendarExceptionDirection, OffDay } from '@pkg/schema/equipment';

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
