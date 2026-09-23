import {
  type DirectoryError,
  type FleetError,
  isDirectoryError,
  isFleetError,
  isJobError,
  isRateCardError,
  isReadingError,
  type JobError,
  type RateCardError,
  type ReadingError,
} from '@pkg/core/contracting';

import { defineCoreErrorFamily } from '../../trpc/errors.js';

/** The Contracting boundary's error families, shared by the tRPC routers and the reading upload route. */

export const fleetErrorFamily = defineCoreErrorFamily<FleetError>({
  codes: {
    'fleet.driver_assigned': 'CONFLICT',
    'fleet.duplicate': 'CONFLICT',
    'fleet.in_use': 'CONFLICT',
    'fleet.invalid_category': 'BAD_REQUEST',
    'fleet.invalid_driver': 'BAD_REQUEST',
    'fleet.invalid_reference': 'BAD_REQUEST',
    'fleet.kind_in_use': 'CONFLICT',
    'fleet.not_found': 'NOT_FOUND',
    'fleet.retired': 'CONFLICT',
  },
  is: isFleetError,
});

export const directoryErrorFamily = defineCoreErrorFamily<DirectoryError>({
  codes: {
    'directory.duplicate': 'CONFLICT',
    'directory.in_use': 'CONFLICT',
    'directory.invalid_reference': 'BAD_REQUEST',
    'directory.not_found': 'NOT_FOUND',
  },
  is: isDirectoryError,
});

export const readingErrorFamily = defineCoreErrorFamily<ReadingError>({
  codes: {
    'reading.baseline_exists': 'CONFLICT',
    'reading.below_latest': 'CONFLICT',
    'reading.capture_id_conflict': 'CONFLICT',
    'reading.invalid_amendment': 'CONFLICT',
    'reading.forbidden': 'FORBIDDEN',
    'reading.implement_on_site': 'CONFLICT',
    'reading.invalid_role': 'CONFLICT',
    'reading.job_invoiced': 'CONFLICT',
    'reading.machine_on_site': 'CONFLICT',
    'reading.no_photo': 'BAD_REQUEST',
    'reading.not_found': 'NOT_FOUND',
    'reading.previous_changed': 'CONFLICT',
    'reading.retired_machine': 'CONFLICT',
    'reading.verification_failed': 'SERVICE_UNAVAILABLE',
    'reading.wrong_status': 'CONFLICT',
  },
  is: isReadingError,
});

export const jobErrorFamily = defineCoreErrorFamily<JobError>({
  codes: {
    'contracting_job.duplicate': 'CONFLICT',
    'contracting_job.forbidden': 'FORBIDDEN',
    'contracting_job.has_on_site_stints': 'CONFLICT',
    'contracting_job.implement_on_site': 'CONFLICT',
    'contracting_job.invalid_driver': 'BAD_REQUEST',
    'contracting_job.invalid_foreman': 'BAD_REQUEST',
    'contracting_job.invalid_reference': 'BAD_REQUEST',
    'contracting_job.invalid_role': 'BAD_REQUEST',
    'contracting_job.machine_on_site': 'CONFLICT',
    'contracting_job.not_found': 'NOT_FOUND',
    'contracting_job.not_owner': 'FORBIDDEN',
    'contracting_job.open_gap_flags': 'CONFLICT',
    'contracting_job.pricing_incomplete': 'CONFLICT',
    'contracting_job.rate_inactive': 'CONFLICT',
    'contracting_job.stint_not_on_site': 'CONFLICT',
    'contracting_job.stint_not_planned': 'CONFLICT',
    'contracting_job.total_changed': 'CONFLICT',
    'contracting_job.wrong_status': 'CONFLICT',
  },
  is: isJobError,
});

export const rateCardErrorFamily = defineCoreErrorFamily<RateCardError>({
  codes: {
    'rate_card.duplicate': 'CONFLICT',
    'rate_card.in_use': 'CONFLICT',
    'rate_card.invalid_reference': 'BAD_REQUEST',
    'rate_card.not_found': 'NOT_FOUND',
    'rate_card.reorder_mismatch': 'CONFLICT',
  },
  is: isRateCardError,
});
