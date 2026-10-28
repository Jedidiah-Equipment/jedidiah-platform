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
export const reportNotFound = (message: string) => new ReportError('report.not_found', message);
export const reportInvalidRange = () =>
  new ReportError('report.invalid_range', 'The heat map range must run forwards and span at most a year.');
