import { describe, expect, it } from 'vitest';

import { scheduledJobSubtitle } from './ScheduledJobsWidget.js';

describe('scheduledJobSubtitle', () => {
  it('names who has the work before what the work is', () => {
    expect(scheduledJobSubtitle('Bonginkosi', 'Agri lowbed 14 ton')).toBe('Bonginkosi - Agri lowbed 14 ton');
  });

  it('falls back to whichever half it has', () => {
    expect(scheduledJobSubtitle(null, 'Agri lowbed 14 ton')).toBe('Agri lowbed 14 ton');
    expect(scheduledJobSubtitle('Bonginkosi', null)).toBe('Bonginkosi');
  });

  it('has nothing to say when the Bay has no operator and the Job has not loaded', () => {
    expect(scheduledJobSubtitle(null, null)).toBeNull();
  });
});
