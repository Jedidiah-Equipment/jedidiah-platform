import { describe, expect, test } from 'vitest';
import { hoursToService, serviceDueStatus, suggestedNextServiceDue } from './service-due.js';

describe('serviceDueStatus', () => {
  test('is unknown until the Machine has both a reading and a Next Service Due', () => {
    expect(serviceDueStatus({ latestReadingHours: null, nextServiceDueHours: 500 })).toBe('unknown');
    expect(serviceDueStatus({ latestReadingHours: 450, nextServiceDueHours: null })).toBe('unknown');
  });

  test('turns due soon within the threshold, inclusive, and overdue once the meter passes it', () => {
    expect(serviceDueStatus({ latestReadingHours: 1349, nextServiceDueHours: 1500 })).toBe('ok');
    expect(serviceDueStatus({ latestReadingHours: 1449, nextServiceDueHours: 1500 })).toBe('due-soon');
    expect(serviceDueStatus({ latestReadingHours: 1400, nextServiceDueHours: 1500 })).toBe('due-soon');
    expect(serviceDueStatus({ latestReadingHours: 1500, nextServiceDueHours: 1500 })).toBe('due-soon');
    expect(serviceDueStatus({ latestReadingHours: 1500.1, nextServiceDueHours: 1500 })).toBe('overdue');
  });

  test('reports the hours left to one decimal', () => {
    expect(hoursToService({ latestReadingHours: 1449.3, nextServiceDueHours: 1500.25 })).toBe(51);
  });
});

describe('suggestedNextServiceDue', () => {
  test('adds the interval to the reading at service, or suggests nothing without one', () => {
    expect(suggestedNextServiceDue(1450.5, 250)).toBe(1700.5);
    expect(suggestedNextServiceDue(1450.5, null)).toBeNull();
  });
});
