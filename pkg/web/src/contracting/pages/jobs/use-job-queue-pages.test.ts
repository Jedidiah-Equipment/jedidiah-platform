import { describe, expect, it } from 'vitest';
import { hasMoreJobs } from './use-job-queue-pages.js';

describe('hasMoreJobs', () => {
  it('needs a full last page', () => {
    expect(hasMoreJobs(150, 150, undefined)).toBe(false);
    expect(hasMoreJobs(200, 200, undefined)).toBe(true);
  });

  it('stops at the served count', () => {
    expect(hasMoreJobs(200, 200, 200)).toBe(false);
    expect(hasMoreJobs(200, 200, 201)).toBe(true);
    expect(hasMoreJobs(200, 400, 400)).toBe(false);
  });

  it('is false while the last page is loading', () => {
    expect(hasMoreJobs(undefined, 0, 5)).toBe(false);
  });
});
