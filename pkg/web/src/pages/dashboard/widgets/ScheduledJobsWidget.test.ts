import { describe, expect, it } from 'vitest';

import { scheduledJobSubtitle } from './ScheduledJobsWidget.js';

describe('scheduledJobSubtitle', () => {
  it('names where the work is before what the work is', () => {
    expect(scheduledJobSubtitle('Bonginkosi', 'Agri lowbed 14 ton')).toBe('Bonginkosi - Agri lowbed 14 ton');
  });

  /** The caller passes the Bay name for an unmanned Bay, so the row never loses its location. */
  it('reads the same shape when the Bay name stands in for a missing operator', () => {
    expect(scheduledJobSubtitle('Fabrication Bay 3', 'Agri lowbed 14 ton')).toBe(
      'Fabrication Bay 3 - Agri lowbed 14 ton',
    );
  });

  it('falls back to whichever half it has', () => {
    expect(scheduledJobSubtitle(null, 'Agri lowbed 14 ton')).toBe('Agri lowbed 14 ton');
    expect(scheduledJobSubtitle('Bonginkosi', null)).toBe('Bonginkosi');
  });

  it('has nothing to say when neither half has arrived', () => {
    expect(scheduledJobSubtitle(null, null)).toBeNull();
  });
});
