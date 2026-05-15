export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`Job not found: ${id}`);
    this.name = 'JobNotFoundError';
  }
}

export class JobStageTransitionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobStageTransitionDeniedError';
  }
}
