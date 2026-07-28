import { addDateOnlyDays, JOHANNESBURG_TIME_ZONE, toPlantDateOnly, zonedDateStartToUtcInstant } from '@pkg/domain';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/** Plant-local hour the daily sweep wakes at, so a Job that finishes Friday is stamped by Saturday. */
export const JOB_COMPLETION_SWEEP_HOUR = 1;

type JobCompletionSweeperOptions = {
  clearTimer?: (timer: unknown) => void;
  now?: () => Date;
  onError?: (error: unknown) => void;
  run: () => Promise<unknown>;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
};

/**
 * Runs the Job completion sweep once at boot, then every day at {@link JOB_COMPLETION_SWEEP_HOUR}
 * plant-local. The sweep is additive and idempotent, so an extra run on every deploy is harmless —
 * a fixed plant hour only keeps the daily slot from drifting to whenever the last deploy happened.
 *
 * Single-flight: a run that overruns its own window does not stack, the next wake-up is scheduled
 * only after the current run settles.
 */
export class JobCompletionSweeper {
  readonly #clearTimer: NonNullable<JobCompletionSweeperOptions['clearTimer']>;
  readonly #now: NonNullable<JobCompletionSweeperOptions['now']>;
  readonly #onError: NonNullable<JobCompletionSweeperOptions['onError']>;
  readonly #run: JobCompletionSweeperOptions['run'];
  readonly #setTimer: NonNullable<JobCompletionSweeperOptions['setTimer']>;
  #disposed = false;
  #timer: unknown;

  constructor({
    clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    now = () => new Date(),
    onError = () => undefined,
    run,
    setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
  }: JobCompletionSweeperOptions) {
    this.#clearTimer = clearTimer;
    this.#now = now;
    this.#onError = onError;
    this.#run = run;
    this.#setTimer = setTimer;
  }

  /** Sweeps immediately, then arms the daily timer. */
  start(): void {
    if (this.#disposed) return;

    void this.#fire();
  }

  dispose(): void {
    this.#disposed = true;

    if (this.#timer !== undefined) {
      this.#clearTimer(this.#timer);
      this.#timer = undefined;
    }
  }

  async #fire(): Promise<void> {
    this.#timer = undefined;

    try {
      await this.#run();
    } catch (error) {
      this.#onError(error);
    }

    if (this.#disposed) return;

    this.#timer = this.#setTimer(() => void this.#fire(), getMillisecondsUntilNextSweep(this.#now()));
  }
}

/** Milliseconds from `now` to the next {@link JOB_COMPLETION_SWEEP_HOUR} in the plant's timezone. */
export function getMillisecondsUntilNextSweep(now: Date): number {
  const today = toPlantDateOnly(now);
  const todaysRun = getPlantSweepInstant(today);

  if (todaysRun > now.getTime()) {
    return todaysRun - now.getTime();
  }

  return getPlantSweepInstant(addDateOnlyDays(today, 1)) - now.getTime();
}

function getPlantSweepInstant(plantDate: string): number {
  // South Africa has no DST, so the sweep hour is a plain offset from plant-local midnight.
  return (
    zonedDateStartToUtcInstant(plantDate, JOHANNESBURG_TIME_ZONE).getTime() +
    JOB_COMPLETION_SWEEP_HOUR * MILLISECONDS_PER_HOUR
  );
}
