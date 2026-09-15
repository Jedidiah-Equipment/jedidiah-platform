import {
  type DirectoryError,
  type FleetError,
  isDirectoryError,
  isFleetError,
  isReadingError,
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
    'reading.no_photo': 'BAD_REQUEST',
    'reading.not_found': 'NOT_FOUND',
    'reading.previous_changed': 'CONFLICT',
    'reading.retired_machine': 'CONFLICT',
    'reading.verification_failed': 'SERVICE_UNAVAILABLE',
  },
  is: isReadingError,
});
