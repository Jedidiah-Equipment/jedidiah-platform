import { recordTelematicsReading } from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { type ContractingPushEvent, floorToTenth } from '@pkg/domain/contracting';
import type { DomainLogger } from '@pkg/schema';
import type { JohnDeerePollSummary } from '@pkg/schema/contracting';
import type { JohnDeereClient } from './client.js';
import type { JohnDeereConnectionService } from './connection-service.js';
import { isJohnDeereError, type JohnDeereError, type JohnDeereErrorCode } from './john-deere-errors.js';
import type { JohnDeereLinkService, PollableLink } from './link-service.js';

export type JohnDeerePollerConfig = {
  db: Db;
  client: JohnDeereClient;
  connection: JohnDeereConnectionService;
  links: JohnDeereLinkService;
  /** Schedules a push once a write has committed; never waits. */
  push: { schedule: (event: ContractingPushEvent) => void };
  logger: DomainLogger;
  now: () => Date;
  intervalMs: number;
  /** Delay before the first scheduled run after start-up. */
  firstRunDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const FIRST_RUN_DELAY_MS = 60 * 1000;
// Deere's Retry-After is honoured up to this; a longer wait ends the run for the next hour instead.
const MAX_RETRY_AFTER_SECONDS = 5 * 60;
const DEFAULT_RETRY_AFTER_SECONDS = 60;

const emptySummary = (skipped: 'not-connected' | 'no-links' | null): JohnDeerePollSummary => ({
  skipped,
  polled: 0,
  stored: 0,
  moved: 0,
  unchanged: 0,
  lost: 0,
  errors: 0,
  endedBy: null,
});

/** A shutdown ends the run between Links rather than waiting out every Retry-After; nothing is recorded. */
class RunStopped extends Error {
  constructor() {
    super('John Deere polling stopped as the API shut down.');
  }
}

/**
 * A Deere refusal the rest of the Links would meet too, so the run ends and the connection records it: the sign-in
 * is gone (the connection row already says so, and the record is skipped), or Deere is unavailable or limiting us.
 */
const RUN_ENDING: ReadonlySet<JohnDeereErrorCode> = new Set<JohnDeereErrorCode>([
  'john_deere.unauthorized',
  'john_deere.not_connected',
  'john_deere.unavailable',
  'john_deere.rate_limited',
]);

const isCode = (error: unknown, code: JohnDeereErrorCode): error is JohnDeereError =>
  isJohnDeereError(error) && error.code === code;

/**
 * Every hour, reads each linked Machine's last reported engine hours from John Deere into its Hour Reading ledger.
 * One run at a time: Refresh now joins a run already in progress rather than starting a second.
 */
export class JohnDeerePoller {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<JohnDeerePollSummary> | null = null;
  private disposed = false;
  private readonly stopping = new AbortController();

  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly config: JohnDeerePollerConfig) {
    this.sleep = config.sleep ?? ((ms) => this.sleepUnlessStopping(ms));
  }

  start(): void {
    this.schedule(this.config.firstRunDelayMs ?? FIRST_RUN_DELAY_MS);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopping.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.running?.catch(() => undefined);
  }

  /** Runs the poll now, or joins the run in progress. */
  runNow(): Promise<JohnDeerePollSummary> {
    this.running ??= this.pollOnce().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private schedule(delayMs: number): void {
    if (this.disposed) return;
    this.timer = setTimeout(async () => {
      try {
        await this.runNow();
      } catch (error) {
        this.config.logger.error({ error }, 'John Deere poll failed');
      }
      this.schedule(this.config.intervalMs);
    }, delayMs);
    this.timer.unref();
  }

  async pollOnce(): Promise<JohnDeerePollSummary> {
    const { connection, links, logger } = this.config;
    if ((await connection.getConnection()).status !== 'connected') return emptySummary('not-connected');
    const pollable = await links.listPollable();
    if (!pollable.length) return emptySummary('no-links');

    const summary = emptySummary(null);
    try {
      for (const link of await this.checkListed(pollable, summary)) {
        this.stopIfDisposed();
        await this.pollLink(link, summary);
      }
      await connection.recordPoll({ error: null });
    } catch (error) {
      if (!(error instanceof RunStopped || isJohnDeereError(error))) throw error;
      summary.endedBy = error.message;
      if (!(error instanceof RunStopped)) await connection.recordPoll({ error: error.message });
    }
    logger.info({ ...summary }, 'John Deere poll finished');
    return summary;
  }

  /** Marks Links whose Deere machine is gone, or back, and returns the ones still listed. */
  private async checkListed(pollable: PollableLink[], summary: JohnDeerePollSummary): Promise<PollableLink[]> {
    const { client, connection, links, now } = this.config;
    const machines = await connection.withAccessToken((token) =>
      client.equipmentByIds(
        token,
        pollable.map((link) => link.equipmentId),
      ),
    );
    const listed = new Map(machines.map((machine) => [machine.id, machine]));
    const present: PollableLink[] = [];
    for (const link of pollable) {
      const machine = listed.get(link.equipmentId);
      if (!machine || machine.archived) {
        if (!link.lost) {
          await links.recordPoll(link.id, { lostAt: now() });
          this.config.logger.warn({ linkId: link.id }, 'John Deere no longer lists a linked machine');
        }
        summary.lost += 1;
      } else {
        if (link.lost) await links.recordPoll(link.id, { lostAt: null });
        present.push(link);
      }
    }
    return present;
  }

  private async pollLink(link: PollableLink, summary: JohnDeerePollSummary): Promise<void> {
    const { client, connection, links, push, logger, now } = this.config;
    try {
      const report = await this.withRetryAfter(() =>
        connection.withAccessToken((token) => client.engineHours(token, link.principalId)),
      );
      summary.polled += 1;
      if (!report) {
        await links.recordPoll(link.id, { lastPolledAt: now() });
        return;
      }
      const result = await recordTelematicsReading({
        db: this.config.db,
        machineId: link.machineId,
        linkId: link.id,
        provider: 'john-deere',
        hours: report.hours,
        reportTime: report.reportTime,
        now: now(),
      });
      summary[result.outcome] += 1;
      // A report from the future is not yet a fact: the Link keeps what it last saw until the clock catches up.
      if (result.outcome === 'unchanged' && result.reason === 'future-report-time') {
        logger.warn({ linkId: link.id, reportTime: report.reportTime }, 'John Deere reported a time in the future');
        await links.recordPoll(link.id, { lastPolledAt: now() });
        return;
      }
      if (result.outcome !== 'unchanged' && result.serviceDueSoonCrossed)
        push.schedule({ kind: 'machine.service-due-soon', machineId: link.machineId });
      await links.recordPoll(link.id, {
        lastPolledAt: now(),
        lastReportTime: report.reportTime,
        lastValue: floorToTenth(report.hours),
        lastError: null,
        lastErrorAt: null,
      });
    } catch (error) {
      if (error instanceof RunStopped || (isJohnDeereError(error) && RUN_ENDING.has(error.code))) throw error;
      if (isCode(error, 'john_deere.not_found')) {
        await links.recordPoll(link.id, { lostAt: now(), lastPolledAt: now() });
        summary.lost += 1;
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ linkId: link.id, error: message }, 'John Deere poll failed for a Link');
      summary.errors += 1;
      await links.recordPoll(link.id, { lastPolledAt: now(), lastError: message, lastErrorAt: now() });
    }
  }

  /** One retry after the wait Deere named; a second refusal ends the run. */
  private async withRetryAfter<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (!isCode(error, 'john_deere.rate_limited')) throw error;
      await this.sleep(retryAfterMs(error));
      this.stopIfDisposed();
      return call();
    }
  }

  private stopIfDisposed(): void {
    if (this.disposed) throw new RunStopped();
  }

  private sleepUnlessStopping(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      this.stopping.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}

const retryAfterMs = (error: JohnDeereError) =>
  Math.min(error.detail.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS, MAX_RETRY_AFTER_SECONDS) * 1000;
