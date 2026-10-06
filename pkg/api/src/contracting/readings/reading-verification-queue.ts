import { BackgroundQueue } from '../../background-queue.js';

/** Schedules a captured reading's AI check after the capture has answered. */
export type ReadingVerifications = { schedule: (readingId: string) => void };

/** Each photo capture's AI check, run in the background; `resume` re-checks readings left pending by a restart. */
export class ReadingVerificationQueue extends BackgroundQueue<string> implements ReadingVerifications {}
