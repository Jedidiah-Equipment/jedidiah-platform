import { describe, expect, it } from 'vitest';
import { JohnDeereClient } from './client.js';

const issuer = 'https://signin.example/oauth2/aus';
const now = new Date('2026-10-26T08:00:00.000Z');

function clientAnswering(...responses: Response[]) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const client = new JohnDeereClient({
    platformBaseUrl: 'https://api.example/platform',
    equipmentBaseUrl: 'https://equipment.example/isg',
    issuer,
    clientId: 'client-id',
    clientSecret: 'client-secret',
    now: () => now,
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      const response = responses.shift();
      if (!response) throw new Error('No response stubbed');
      return response;
    },
  });
  return { client, requests };
}

const tokenBody = { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 43_200, token_type: 'Bearer' };

describe('JohnDeereClient', () => {
  it('builds the authorize URL with the scopes, state and redirect', () => {
    const { client } = clientAnswering();
    const url = new URL(
      client.authorizeUrl({ scopes: 'eq1 offline_access', state: 'connect:abc', redirectUri: 'https://api/cb' }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(`${issuer}/v1/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client-id',
      redirect_uri: 'https://api/cb',
      scope: 'eq1 offline_access',
      state: 'connect:abc',
    });
  });

  it('exchanges a code and refreshes with form-encoded client credentials, dating the expiry from now', async () => {
    const { client, requests } = clientAnswering(Response.json(tokenBody), Response.json(tokenBody));
    const expected = {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: new Date(now.getTime() + 43_200_000),
    };

    expect(await client.exchangeCode({ code: 'the-code', redirectUri: 'https://api/cb' })).toEqual(expected);
    expect(
      await client.refresh({ refreshToken: 'refresh-0', redirectUri: 'https://api/cb', scopes: 'eq1 offline_access' }),
    ).toEqual(expected);

    const [exchange, refresh] = requests.map(({ url, init }) => ({
      url,
      method: init?.method,
      headers: init?.headers,
      body: Object.fromEntries(new URLSearchParams(String(init?.body))),
    }));
    expect(exchange).toEqual({
      url: `${issuer}/v1/token`,
      method: 'POST',
      headers: expect.objectContaining({
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body: {
        grant_type: 'authorization_code',
        code: 'the-code',
        redirect_uri: 'https://api/cb',
        client_id: 'client-id',
        client_secret: 'client-secret',
      },
    });
    expect(refresh?.body).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'refresh-0',
      redirect_uri: 'https://api/cb',
      scope: 'eq1 offline_access',
      client_id: 'client-id',
      client_secret: 'client-secret',
    });
  });

  it('reads only a refused grant as unauthorized, not a misconfigured client', async () => {
    const { client } = clientAnswering(
      Response.json({ error: 'invalid_grant' }, { status: 400 }),
      Response.json({ error: 'invalid_client' }, { status: 400 }),
    );
    const refresh = () =>
      client.refresh({ refreshToken: 'dead', redirectUri: 'https://api/cb', scopes: 'eq1 offline_access' });
    await expect(refresh()).rejects.toMatchObject({ code: 'john_deere.unauthorized' });
    await expect(refresh()).rejects.toMatchObject({ code: 'john_deere.bad_response' });
  });

  it('lists organizations across pages with their connection links', async () => {
    const { client, requests } = clientAnswering(
      Response.json({
        links: [{ rel: 'nextPage', uri: 'https://api.example/platform/organizations;start=1' }],
        values: [
          {
            id: '4321',
            name: 'Jedidiah Boerdery',
            type: 'customer',
            member: true,
            links: [{ rel: 'manage_connections', uri: 'https://connections.example/manage' }],
          },
        ],
      }),
      Response.json({
        values: [
          {
            id: 99,
            name: 'Neighbour',
            links: [{ rel: 'connections', uri: 'https://connections.example/select' }],
          },
        ],
      }),
    );

    expect(await client.organizations('access-1')).toEqual([
      {
        id: '4321',
        name: 'Jedidiah Boerdery',
        type: 'customer',
        member: true,
        connectionsUrl: null,
        manageConnectionsUrl: 'https://connections.example/manage',
      },
      {
        id: '99',
        name: 'Neighbour',
        type: null,
        member: false,
        connectionsUrl: 'https://connections.example/select',
        manageConnectionsUrl: null,
      },
    ]);
    expect(requests.map(({ url }) => url)).toEqual([
      'https://api.example/platform/organizations?showLinks=connections,manage_connections',
      'https://api.example/platform/organizations;start=1',
    ]);
    expect(requests[0]?.init?.headers).toEqual({
      Accept: 'application/vnd.deere.axiom.v3+json',
      'Accept-Encoding': 'gzip',
      Authorization: 'Bearer access-1',
    });
  });

  it('lists connected machines across pages, mapped, with a modem when a TelematicsGateway is paired', async () => {
    const machine = {
      id: 'eq-1',
      principalId: 217373,
      name: '8R 410',
      serialNumber: '1RW8410RCNA012345',
      engineSerialNumber: 'RG6135U000500',
      modelYear: '2022',
      make: { name: 'JOHN DEERE' },
      model: { name: '8R 410' },
      organization: [{ '@type': 'Resource', id: 1234 }],
      telematicsCapable: true,
      archived: false,
      devices: [{ '@type': 'Display' }, { '@type': 'TelematicsGateway' }],
    };
    const { client, requests } = clientAnswering(
      Response.json({
        links: [{ rel: 'nextPage', uri: 'https://equipment.example/isg/equipment?pageOffset=100' }],
        values: [machine],
      }),
      Response.json({
        values: [{ id: 77, principalId: 9, name: 'Gator', organization: [{ id: '1234' }], devices: [] }],
      }),
    );

    expect(await client.equipment('access-1')).toEqual([
      {
        id: 'eq-1',
        principalId: 217373,
        name: '8R 410',
        serialNumber: '1RW8410RCNA012345',
        engineSerialNumber: 'RG6135U000500',
        make: 'JOHN DEERE',
        model: '8R 410',
        modelYear: '2022',
        organizationId: '1234',
        telematicsCapable: true,
        archived: false,
        hasModem: true,
      },
      {
        id: '77',
        principalId: 9,
        name: 'Gator',
        serialNumber: null,
        engineSerialNumber: null,
        make: null,
        model: null,
        modelYear: null,
        organizationId: '1234',
        telematicsCapable: false,
        archived: false,
        hasModem: false,
      },
    ]);
    expect(requests.map(({ url }) => url)).toEqual([
      'https://equipment.example/isg/equipment?categories=Machine&capableOf=Connectivity&archived=false&embed=devices&itemLimit=100',
      'https://equipment.example/isg/equipment?pageOffset=100',
    ]);
    expect(requests[0]?.init?.headers).toMatchObject({ Accept: 'application/json', Authorization: 'Bearer access-1' });
  });

  it('looks machines up by id, archived ones included', async () => {
    const { client, requests } = clientAnswering(Response.json({ values: [] }));
    expect(await client.equipmentByIds('access-1', ['eq-1', 'eq-2'])).toEqual([]);
    const url = new URL(requests[0]?.url ?? '');
    expect(url.searchParams.get('ids')).toBe('eq-1,eq-2');
    expect(url.searchParams.has('archived')).toBe(false);
  });

  it('reads the last known engine hours, or null when the machine has reported none', async () => {
    const { client, requests } = clientAnswering(
      Response.json({
        values: [
          {
            reading: { valueAsDouble: 1234.56, unit: 'Hours' },
            reportTime: '2026-10-26T06:30:00.000Z',
            source: 'TM',
          },
        ],
      }),
      Response.json({ values: [] }),
    );

    expect(await client.engineHours('access-1', 217373)).toEqual({
      hours: 1234.56,
      reportTime: new Date('2026-10-26T06:30:00.000Z'),
      source: 'TM',
    });
    expect(await client.engineHours('access-1', 9)).toBeNull();
    expect(requests[0]?.url).toBe(
      'https://api.example/platform/machines/217373/engineHours?lastKnown=true&showLinks=none',
    );
    expect(requests[0]?.init?.headers).toMatchObject({ Accept: 'application/vnd.deere.axiom.v3+json' });
  });

  it.each([
    [new Response('', { status: 401 }), { code: 'john_deere.unauthorized' }],
    [new Response('', { status: 403 }), { code: 'john_deere.forbidden' }],
    [
      new Response('', {
        status: 403,
        headers: { 'X-Deere-Warning': 'terms', 'X-Deere-Terms-Location': 'https://terms.example' },
      }),
      { code: 'john_deere.restricted_org', detail: { termsLocation: 'https://terms.example' } },
    ],
    [new Response('', { status: 404 }), { code: 'john_deere.not_found' }],
    [
      new Response('', { status: 429, headers: { 'Retry-After': '30' } }),
      { code: 'john_deere.rate_limited', detail: { retryAfterSeconds: 30 } },
    ],
    [
      new Response('', { status: 503, headers: { 'Retry-After': '120' } }),
      { code: 'john_deere.unavailable', detail: { retryAfterSeconds: 120 } },
    ],
    [new Response('', { status: 503 }), { code: 'john_deere.unavailable', detail: {} }],
    [new Response('not json', { status: 200 }), { code: 'john_deere.bad_response' }],
    [Response.json({ values: 'nope' }), { code: 'john_deere.bad_response' }],
  ])('maps a failed read to its refusal (%#)', async (response, expected) => {
    const { client } = clientAnswering(response);
    await expect(client.organizations('access-1')).rejects.toMatchObject(expected);
  });
});
