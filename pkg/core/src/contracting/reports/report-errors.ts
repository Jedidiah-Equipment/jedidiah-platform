export type ReportErrorCode = 'report.not_found' | 'report.invalid_range';
export class ReportError extends Error {
  constructor(
    readonly code: ReportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReportError';
  }
}
export function isReportError(error: unknown): error is ReportError {
  return error instanceof ReportError;
}
