import { describe, expect, test } from 'vitest';
import {
  hoursToService,
  hoursToServiceLabel,
  machineBusyWith,
  serviceDueSoonCrossed,
  serviceDueStatus,
  suggestedNextServiceDue,
} from './service-due.js';

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

describe('hoursToServiceLabel', () => {
  test('says what is left before the service, or how far past it the meter is', () => {
    expect(hoursToServiceLabel(88)).toBe('88.0 h to go');
    expect(hoursToServiceLabel(-12.5)).toBe('Overdue by 12.5 h');
  });
});

describe('machineBusyWith', () => {
  const job = { jobNumber: 'CJOB-7', customerName: 'Rowley' };
  test('names the Job when the reader may see it, else only its Job Number', () => {
    expect(machineBusyWith({ busyOnJob: job, onSiteJobNumber: 'CJOB-7' })).toEqual({ job, jobNumber: 'CJOB-7' });
    expect(machineBusyWith({ busyOnJob: null, onSiteJobNumber: 'CJOB-7' })).toEqual({ job: null, jobNumber: 'CJOB-7' });
    expect(machineBusyWith({ busyOnJob: null, onSiteJobNumber: null })).toBeNull();
  });
});

describe('serviceDueSoonCrossed', () => {
  const due = 1500;
  const crossed = (previousHours: number | null, newHours: number, nextServiceDueHours: number | null = due) =>
    serviceDueSoonCrossed({ previousHours, newHours, nextServiceDueHours });

  test('fires once, on the capture that first lands inside the window', () => {
    expect(crossed(null, 1450)).toBe(true);
    expect(crossed(1300, 1450)).toBe(true);
    expect(crossed(1300, 1550)).toBe(true);
    expect(crossed(1450, 1460)).toBe(false);
    expect(crossed(1300, 1350)).toBe(false);
  });

  test('stays quiet without a Next Service Due, and re-arms when it moves on', () => {
    expect(crossed(null, 1450, null)).toBe(false);
    expect(crossed(1460, 1470, 2000)).toBe(false);
    expect(crossed(1470, 1910, 2000)).toBe(true);
  });
});
