import type { ServiceErrorCode } from '@pkg/schema/contracting';
import { translatingConstraintViolations } from '../../errors/constraint-violations.js';

export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}
export const isServiceError = (error: unknown): error is ServiceError => error instanceof ServiceError;
export const serviceRecordNotFound = () => new ServiceError('service.not_found', 'Service Record not found.');
export const invalidServiceMechanic = () =>
  new ServiceError('service.invalid_mechanic', 'Select a person with the Contracting mechanic role.');

export const withServiceConstraints = <T>(action: () => Promise<T>) =>
  translatingConstraintViolations(
    {
      unique: () => undefined,
      foreignKey: (constraint) => {
        if (constraint.includes('primary_mechanic')) return invalidServiceMechanic();
        if (constraint.includes('machine_id')) return new ServiceError('service.not_found', 'Machine not found.');
        return undefined;
      },
    },
    action,
  );
