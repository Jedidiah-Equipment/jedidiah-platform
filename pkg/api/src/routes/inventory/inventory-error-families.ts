import {
  type BuildError,
  isBuildError,
  isJobCloseOutError,
  isStockMovementCoreError,
  JobCancelledError,
  type JobCloseOutError,
  JobNotFoundError,
  type StockMovementCoreError,
} from '@pkg/core';

import { defineCoreErrorFamily } from '../../trpc/errors.js';

/**
 * The inventory boundary's error families. Each procedure names only the families it can actually
 * raise — a stock read cannot fail as a build, and a build has no Job to cancel — so the list at a
 * call site doubles as documentation of what that endpoint touches.
 */

/** The ledger's own rules, shared by every router that writes a movement. */
export const stockMovementErrorFamily = defineCoreErrorFamily<StockMovementCoreError>({
  codes: {
    'inventory.fabricated_part_cost': 'BAD_REQUEST',
    'inventory.invalid_delta': 'BAD_REQUEST',
    'inventory.invalid_length': 'BAD_REQUEST',
    'inventory.part_not_found': 'NOT_FOUND',
    'inventory.periodic_movement': 'BAD_REQUEST',
  },
  is: isStockMovementCoreError,
  messages: { 'inventory.part_not_found': 'Part not found.' },
});

export const buildErrorFamily = defineCoreErrorFamily<BuildError>({
  codes: {
    'inventory.build_component_not_found': 'NOT_FOUND',
    'inventory.build_linear_part': 'BAD_REQUEST',
    'inventory.build_periodic_part': 'BAD_REQUEST',
    'inventory.build_self_component': 'BAD_REQUEST',
  },
  is: isBuildError,
});

export const jobCloseOutErrorFamily = defineCoreErrorFamily<JobCloseOutError>({
  codes: {
    'inventory.job_already_closed_out': 'BAD_REQUEST',
    'inventory.job_closed_out': 'BAD_REQUEST',
    'inventory.job_not_completed': 'BAD_REQUEST',
  },
  is: isJobCloseOutError,
});

/** The Job failures a stock movement reaches, which are not the Job router's whole surface. */
type StockMovementJobError = JobCancelledError | JobNotFoundError;

export const stockMovementJobErrorFamily = defineCoreErrorFamily<StockMovementJobError>({
  codes: {
    'job.cancelled': 'BAD_REQUEST',
    'job.not_found': 'NOT_FOUND',
  },
  is: (error): error is StockMovementJobError =>
    error instanceof JobCancelledError || error instanceof JobNotFoundError,
  messages: { 'job.not_found': 'Job not found.' },
});
