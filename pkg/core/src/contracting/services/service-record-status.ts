import { contractingServiceRecords } from '@pkg/db/contracting';
import type { ServiceRecordStatus } from '@pkg/schema/contracting';
import { isNotNull, isNull } from 'drizzle-orm';

/** Open is Booked In: no close-out yet. Every Service Record read filters, orders and counts by this one test. */
export const serviceRecordStatusCondition = (status: ServiceRecordStatus) =>
  status === 'open' ? isNull(contractingServiceRecords.closedAt) : isNotNull(contractingServiceRecords.closedAt);
