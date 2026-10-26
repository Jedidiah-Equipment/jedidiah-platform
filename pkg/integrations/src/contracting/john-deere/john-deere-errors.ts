export type JohnDeereErrorCode =
  | 'john_deere.unauthorized'
  | 'john_deere.forbidden'
  | 'john_deere.not_found'
  | 'john_deere.rate_limited'
  | 'john_deere.unavailable'
  | 'john_deere.restricted_org'
  | 'john_deere.bad_response'
  | 'john_deere.invalid_state'
  | 'john_deere.not_connected'
  | 'john_deere.not_configured';

/** What a caller may act on: when to try again, or where the organization's terms wait to be accepted. */
export type JohnDeereErrorDetail = { retryAfterSeconds?: number; termsLocation?: string };

export class JohnDeereError extends Error {
  constructor(
    readonly code: JohnDeereErrorCode,
    message: string,
    readonly detail: JohnDeereErrorDetail = {},
  ) {
    super(message);
    this.name = 'JohnDeereError';
  }
}

export const isJohnDeereError = (error: unknown): error is JohnDeereError => error instanceof JohnDeereError;

export const badResponse = (message: string) => new JohnDeereError('john_deere.bad_response', message);
export const invalidState = () =>
  new JohnDeereError('john_deere.invalid_state', 'This John Deere sign-in has expired. Press Connect again.');
export const notConfigured = () =>
  new JohnDeereError('john_deere.not_configured', 'John Deere is not configured in this environment.');
export const notConnected = () =>
  new JohnDeereError('john_deere.not_connected', 'John Deere is not connected. Connect it on the John Deere tab.');

function retryDetail(response: Response): JohnDeereErrorDetail {
  const header = response.headers.get('Retry-After');
  const seconds = header === null ? Number.NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? { retryAfterSeconds: seconds } : {};
}

/** The refusal a non-2xx John Deere response stands for. */
export function johnDeereResponseError(response: Response, body: string): JohnDeereError {
  const status = response.status;
  if (status === 401) return new JohnDeereError('john_deere.unauthorized', 'John Deere refused the sign-in.');
  if (status === 403) {
    if (response.headers.has('X-Deere-Warning')) {
      const termsLocation = response.headers.get('X-Deere-Terms-Location');
      return new JohnDeereError(
        'john_deere.restricted_org',
        'The John Deere organization must accept updated terms before Jedidiah can read it.',
        termsLocation ? { termsLocation } : {},
      );
    }
    return new JohnDeereError('john_deere.forbidden', 'John Deere does not allow Jedidiah to read this.');
  }
  if (status === 404) return new JohnDeereError('john_deere.not_found', 'John Deere has no such record.');
  if (status === 429)
    return new JohnDeereError('john_deere.rate_limited', 'John Deere is limiting requests.', retryDetail(response));
  if (status >= 500)
    return new JohnDeereError('john_deere.unavailable', 'John Deere is unavailable right now.', retryDetail(response));
  return badResponse(`John Deere answered ${status}.${body ? ` ${body.slice(0, 200)}` : ''}`);
}
