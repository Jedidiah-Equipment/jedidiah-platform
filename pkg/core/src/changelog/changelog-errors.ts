export class UnknownChangelogReleaseError extends Error {
  readonly code = 'changelog.unknown_release';
  readonly metadata: { releasedAt: string };

  constructor(releasedAt: string) {
    super(`No changelog was released at ${releasedAt}`);
    this.name = 'UnknownChangelogReleaseError';
    this.metadata = { releasedAt };
  }
}

export type ChangelogCoreError = UnknownChangelogReleaseError;

export function isChangelogCoreError(error: unknown): error is ChangelogCoreError {
  return error instanceof UnknownChangelogReleaseError;
}
