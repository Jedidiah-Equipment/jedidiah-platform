import type { ApiErrorShape } from '@pkg/schema';
import { z } from 'zod';
import { authedFetch } from './authed-fetch';
import { addBreadcrumb } from './observability';

const RefusalBody = z
  .object({ message: z.string().optional(), data: z.object({ appCode: z.string().optional() }).nullish() })
  .catch({});

/**
 * The server judged the upload and refused it: `message` is its sentence for the person, `data.appCode` its reason.
 * Shaped like the API's tRPC errors, so `useBusyAction` shows it and the mutation cache never reports it.
 */
export class UploadRefusedError extends Error implements ApiErrorShape {
  readonly data: { appCode: string };
  constructor(
    appCode: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'UploadRefusedError';
    this.data = { appCode };
  }
}

export type UploadFailure = 'timeout' | 'network' | 'server';

/** No answer the server meant: the request timed out, never reached it, or came back without a reason. */
export class UploadFailedError extends Error {
  constructor(
    message: string,
    readonly reason: UploadFailure,
    readonly status: number | null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'UploadFailedError';
  }
}

type PostOptions<T> = {
  timeoutMs: number;
  /** The sentence shown for anything that is not the server's own refusal. */
  failedMessage: string;
  /** The shape of a successful answer; a 2xx that does not fit it is a server failure. */
  output?: z.ZodType<T>;
};

/**
 * Posts one multipart body over the authed plain-HTTP routes, which tRPC's batch link cannot carry. Answers the parsed
 * body on 2xx. A refusal is a status the server chose for the person — any 4xx but 401 (signed out), 408 and 429
 * (try again later), or a 503 (a dependency it named) — whose body carries an app code; that throws
 * {@link UploadRefusedError} with the server's sentence. Everything else throws {@link UploadFailedError}.
 */
export async function postMultipart<T = unknown>(path: string, body: FormData, options: PostOptions<T>): Promise<T> {
  const { timeoutMs, failedMessage, output = z.unknown() as z.ZodType<T> } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let status: number | null = null;
  try {
    const response = await authedFetch(path, { method: 'POST', body, signal: controller.signal });
    status = response.status;
    if (response.ok) return output.parse(await response.json().catch(() => undefined));
    if (isRefusalStatus(status)) {
      const refusal = RefusalBody.parse(
        await response.json().catch(() => {
          addBreadcrumb('network', 'refusal response unreadable', { status });
          return null;
        }),
      );
      if (refusal.data?.appCode)
        throw new UploadRefusedError(
          refusal.data.appCode,
          refusal.message ?? 'The server refused this request.',
          status,
        );
    }
    throw new UploadFailedError(failedMessage, 'server', status);
  } catch (error) {
    if (error instanceof UploadRefusedError || error instanceof UploadFailedError) throw error;
    const reason = controller.signal.aborted ? 'timeout' : status === null ? 'network' : 'server';
    throw new UploadFailedError(failedMessage, reason, status, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

const isRefusalStatus = (status: number) =>
  (status >= 400 && status < 500 && ![401, 408, 429].includes(status)) || status === 503;
