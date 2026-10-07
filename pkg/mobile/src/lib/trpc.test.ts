import { TRPCClientError } from '@trpc/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-base-url', () => ({ apiBaseUrl: 'https://api.jedidiah.test' }));
vi.mock('./auth', () => ({ sessionCookieHeader: async () => null }));
vi.mock('./observability', () => ({ addBreadcrumb: vi.fn() }));

import { addBreadcrumb } from './observability';
import { ApiGatewayError, createTrpcClient } from './trpc';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(addBreadcrumb).mockClear();
});

function answerWith(response: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  );
}

describe('createTrpcClient', () => {
  it.each([
    ['an empty body', new Response('', { status: 504 })],
    ['an HTML page', new Response('<h1>Bad Gateway</h1>', { headers: { 'content-type': 'text/html' }, status: 502 })],
  ])('reports a 5xx with %s as a gateway failure, not a parse error', async (_label, response) => {
    answerWith(response);

    const error = await createTrpcClient()
      .auth.access.query()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TRPCClientError);
    expect((error as TRPCClientError<never>).cause).toBeInstanceOf(ApiGatewayError);
    expect((error as TRPCClientError<never>).message).toBe(
      `API gateway answered ${response.status} without a tRPC response`,
    );
    expect(addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(addBreadcrumb).toHaveBeenCalledWith(
      'network',
      'tRPC batch',
      expect.objectContaining({ status: response.status }),
    );
  });

  it('keeps the server error a tRPC 5xx answers with', async () => {
    answerWith(
      Response.json(
        [{ error: { code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 }, message: 'Boom' } }],
        {
          status: 500,
        },
      ),
    );

    const error = await createTrpcClient()
      .auth.access.query()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TRPCClientError);
    expect((error as TRPCClientError<never>).message).toBe('Boom');
    expect((error as TRPCClientError<never>).data).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
});
