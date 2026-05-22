export type ScheduleRollupBooking = {
  actualEnd: Date | null;
  actualStart: Date | null;
  plannedEnd: Date | null;
  plannedStart: Date | null;
};

export type ScheduleRollupStage = {
  bookings: readonly ScheduleRollupBooking[];
};

export type ScheduleRollupWindow = {
  end: Date | null;
  start: Date | null;
};

export type ScheduleRollupResult = {
  actualWindow: ScheduleRollupWindow;
  plannedWindow: ScheduleRollupWindow;
};

export function scheduleRollup(bookings: readonly ScheduleRollupBooking[]): ScheduleRollupResult {
  return {
    actualWindow: rollupWindow(
      bookings.map((booking) => ({
        end: booking.actualEnd,
        start: booking.actualStart,
      })),
    ),
    plannedWindow: rollupWindow(
      bookings.map((booking) => ({
        end: booking.plannedEnd,
        start: booking.plannedStart,
      })),
    ),
  };
}

export function rollupStageSchedule(bookings: readonly ScheduleRollupBooking[]): ScheduleRollupResult {
  return scheduleRollup(bookings);
}

export function rollupJobSchedule(stages: readonly ScheduleRollupStage[]): ScheduleRollupResult {
  return scheduleRollup(stages.flatMap((stage) => stage.bookings));
}

function rollupWindow(windows: readonly ScheduleRollupWindow[]): ScheduleRollupWindow {
  return {
    end: maxDateWhenAllPresent(windows.map((window) => window.end)),
    start: minDate(windows.map((window) => window.start)),
  };
}

function minDate(dates: readonly (Date | null)[]): Date | null {
  const timestamps = dates.filter((date): date is Date => Boolean(date)).map((date) => date.getTime());
  if (timestamps.length === 0) return null;

  return new Date(Math.min(...timestamps));
}

function maxDateWhenAllPresent(dates: readonly (Date | null)[]): Date | null {
  if (dates.length === 0 || dates.some((date) => !date)) return null;

  const timestamps = dates.filter((date): date is Date => Boolean(date)).map((date) => date.getTime());
  return new Date(Math.max(...timestamps));
}
