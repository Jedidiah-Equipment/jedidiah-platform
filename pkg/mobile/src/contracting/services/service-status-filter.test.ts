import { describe, expect, it } from 'vitest';
import { isStatusFilter, statusesFor } from './service-status-filter';

describe('service status filter', () => {
  it('lists the services Booked in by default, the closed ones, or every one', () => {
    expect(statusesFor('open')).toEqual(['open']);
    expect(statusesFor('closed')).toEqual(['closed']);
    expect(statusesFor('all')).toEqual(['open', 'closed']);
    expect(isStatusFilter('closed')).toBe(true);
    expect(isStatusFilter('bogus')).toBe(false);
  });
});
