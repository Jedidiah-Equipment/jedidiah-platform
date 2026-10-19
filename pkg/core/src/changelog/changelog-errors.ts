export type ChangelogErrorCode = 'changelog.unknown_release';

export class ChangelogError extends Error {
  constructor(
    readonly code: ChangelogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChangelogError';
  }
}

export const isChangelogError = (error: unknown): error is ChangelogError => error instanceof ChangelogError;
export const unknownChangelogRelease = (releasedAt: string) =>
  new ChangelogError('changelog.unknown_release', `No changelog was released at ${releasedAt}`);
