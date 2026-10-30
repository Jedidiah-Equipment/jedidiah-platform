import { describe, expect, test } from 'vitest';
import { statusBadgeColorClassNames } from '../theme/status-badge.js';
import {
  effectiveServiceAlertHours,
  hoursToService,
  hoursToServiceLabel,
  isDueForService,
  machineBusyWith,
  machineServiceBadge,
  machinesDueForService,
  serviceDueSoonCrossed,
  serviceDueStatus,
  suggestedNextServiceDue,
  suggestedNextServiceDueValue,
} from './service-due.js';
import { CONTRACTING_SETTINGS_DEFAULTS } from './settings.js';

const threshold = CONTRACTING_SETTINGS_DEFAULTS.serviceDueSoonThresholdHours;

describe('serviceDueStatus', () => {
  test('is unknown until the Machine has both a reading and a Next Service Due', () => {
    expect(serviceDueStatus({ latestReadingHours: null, nextServiceDueHours: 500 }, threshold)).toBe('unknown');
    expect(serviceDueStatus({ latestReadingHours: 450, nextServiceDueHours: null }, threshold)).toBe('unknown');
  });

  test('turns due soon within the threshold, inclusive, and overdue once the meter passes it', () => {
    expect(serviceDueStatus({ latestReadingHours: 1349, nextServiceDueHours: 1500 }, threshold)).toBe('ok');
    expect(serviceDueStatus({ latestReadingHours: 1449, nextServiceDueHours: 1500 }, threshold)).toBe('due-soon');
    expect(serviceDueStatus({ latestReadingHours: 1400, nextServiceDueHours: 1500 }, threshold)).toBe('due-soon');
    expect(serviceDueStatus({ latestReadingHours: 1500, nextServiceDueHours: 1500 }, threshold)).toBe('due-soon');
    expect(serviceDueStatus({ latestReadingHours: 1500.1, nextServiceDueHours: 1500 }, threshold)).toBe('overdue');
  });

  test('reads the threshold it is given: 120 h to go is on track at 100 and due soon at 150', () => {
    expect(serviceDueStatus({ latestReadingHours: 1380, nextServiceDueHours: 1500 }, 100)).toBe('ok');
    expect(serviceDueStatus({ latestReadingHours: 1380, nextServiceDueHours: 1500 }, 150)).toBe('due-soon');
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

  test('stays blank in the form while the reading is blank or there is no interval', () => {
    expect(suggestedNextServiceDueValue(1450.5, 250)).toBe(1700.5);
    expect(suggestedNextServiceDueValue(Number.NaN, 250)).toBeNaN();
    expect(suggestedNextServiceDueValue(1450.5, null)).toBeNaN();
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
    serviceDueSoonCrossed({ previousHours, newHours, nextServiceDueHours, threshold });

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

  test('crosses the edge the current threshold draws, never a constant', () => {
    const at = (threshold: number) =>
      serviceDueSoonCrossed({ previousHours: 1300, newHours: 1380, nextServiceDueHours: 1500, threshold });
    expect(at(100)).toBe(false);
    expect(at(150)).toBe(true);
  });
});

describe('isDueForService', () => {
  test('is due soon or overdue with no open Service Record', () => {
    expect(isDueForService({ serviceDueStatus: 'due-soon', bookedInServiceId: null })).toBe(true);
    expect(isDueForService({ serviceDueStatus: 'overdue', bookedInServiceId: null })).toBe(true);
    expect(isDueForService({ serviceDueStatus: 'ok', bookedInServiceId: null })).toBe(false);
    expect(isDueForService({ serviceDueStatus: 'unknown', bookedInServiceId: null })).toBe(false);
  });

  test('booking the Machine in takes it off before its hours change', () => {
    expect(
      isDueForService({ serviceDueStatus: 'overdue', bookedInServiceId: '00000000-0000-4000-8000-0000000000aa' }),
    ).toBe(false);
  });
});

describe('machineServiceBadge', () => {
  test('names the status in its colour while nothing is booked in', () => {
    expect(machineServiceBadge({ serviceDueStatus: 'overdue', bookedInServiceId: null })).toEqual({
      label: 'Service overdue',
      colours: statusBadgeColorClassNames.red,
    });
    expect(machineServiceBadge({ serviceDueStatus: 'due-soon', bookedInServiceId: null }).label).toBe(
      'Service due soon',
    );
  });

  test('reads Booked in, in blue, whatever the hours say, while a Service Record is open', () => {
    expect(
      machineServiceBadge({ serviceDueStatus: 'overdue', bookedInServiceId: '00000000-0000-4000-8000-0000000000aa' }),
    ).toEqual({
      label: 'Booked in',
      colours: statusBadgeColorClassNames.blue,
    });
  });
});

describe('effectiveServiceAlertHours', () => {
  test("a Machine's Service Alert Hours win over Settings, and blank falls back to Settings", () => {
    expect(effectiveServiceAlertHours({ serviceAlertHours: 50 }, 100)).toBe(50);
    expect(effectiveServiceAlertHours({ serviceAlertHours: null }, 100)).toBe(100);
  });

  test('zero is a real override: due soon only once the meter reaches Next Service Due', () => {
    expect(effectiveServiceAlertHours({ serviceAlertHours: 0 }, 100)).toBe(0);
  });
});

test('keeps only Machines Due for Service, overdue first, then the fewest hours to go', () => {
  const machine = (
    code: string,
    serviceDueStatus: 'unknown' | 'ok' | 'due-soon' | 'overdue',
    hoursToService: number | null,
    bookedInServiceId: string | null = null,
  ) => ({ code, serviceDueStatus, hoursToService, bookedInServiceId });
  const due = machinesDueForService([
    machine('TRAC-1', 'ok', 400),
    machine('TRAC-2', 'due-soon', 80),
    machine('TRAC-3', 'unknown', null),
    machine('TRAC-4', 'overdue', -5),
    machine('TRAC-5', 'due-soon', 20),
    machine('TRAC-6', 'overdue', -40),
    machine('TRAC-7', 'overdue', -90, '00000000-0000-4000-8000-0000000000aa'),
  ]);
  expect(due.map((entry) => entry.code)).toEqual(['TRAC-6', 'TRAC-4', 'TRAC-5', 'TRAC-2']);
});
