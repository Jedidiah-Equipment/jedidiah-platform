export class DuplicateStationNameError extends Error {
  readonly code = 'station.duplicate_name';
  readonly metadata: { department: string; name: string };

  constructor(input: { department: string; name: string }) {
    super(`Station name already exists in ${input.department}: ${input.name}`);
    this.name = 'DuplicateStationNameError';
    this.metadata = input;
  }
}

export class StationNotFoundError extends Error {
  readonly code = 'station.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Station not found: ${id}`);
    this.name = 'StationNotFoundError';
    this.metadata = { id };
  }
}

export type StationCoreError = DuplicateStationNameError | StationNotFoundError;

export function isStationCoreError(error: unknown): error is StationCoreError {
  return error instanceof DuplicateStationNameError || error instanceof StationNotFoundError;
}
