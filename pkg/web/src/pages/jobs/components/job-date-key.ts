import { JOHANNESBURG_TIME_ZONE, toJohannesburgDateKey, zonedDateStartToUtcInstant } from '@pkg/domain';

export function toJobDateKey(date: Date): string {
  return toJohannesburgDateKey(date);
}

export function fromJobDateKey(value: string): Date {
  return zonedDateStartToUtcInstant(value, JOHANNESBURG_TIME_ZONE);
}
