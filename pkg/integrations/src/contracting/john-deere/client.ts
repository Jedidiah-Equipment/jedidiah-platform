import { z } from 'zod';
import { badResponse, JohnDeereError, johnDeereResponseError } from './john-deere-errors.js';

export type JohnDeereClientConfig = {
  /** The Operations Center platform API, `…/platform`; the sandbox until Deere validates the application. */
  platformBaseUrl: string;
  /** The Equipment API, `…/isg`. */
  equipmentBaseUrl: string;
  /** The OAuth authorization server, without the trailing `/v1`. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  fetch: typeof fetch;
  now: () => Date;
};

export type JohnDeereTokens = { accessToken: string; refreshToken: string; expiresAt: Date };

/**
 * An organization the signed-in login belongs to. Until the organization has granted the application access
 * it carries a `connectionsUrl` (where to grant it); once granted, a `manageConnectionsUrl`.
 */
export type JohnDeereOrganizationListing = {
  id: string;
  name: string;
  type: string | null;
  member: boolean;
  connectionsUrl: string | null;
  manageConnectionsUrl: string | null;
};

/** A machine in the connected organization, as the Equipment API lists it. `id` is unique across organizations. */
export type DeereMachine = {
  id: string;
  principalId: number;
  name: string;
  /** The PIN. */
  serialNumber: string | null;
  engineSerialNumber: string | null;
  make: string | null;
  model: string | null;
  modelYear: string | null;
  organizationId: string;
  telematicsCapable: boolean;
  archived: boolean;
  /** A TelematicsGateway (the modem) is paired, so the machine can report its hours. */
  hasModem: boolean;
};

/** The machine's last reported engine hours. */
export type DeereEngineHours = { hours: number; reportTime: Date; source: string };

const AXIOM_JSON = 'application/vnd.deere.axiom.v3+json';

const TokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
});

const TokenRefusal = z.object({ error: z.literal('invalid_grant') });

const Link = z.object({ rel: z.string(), uri: z.string() });
const OrganizationsPage = z.object({
  links: z.array(Link).optional(),
  values: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      name: z.string(),
      type: z.string().optional(),
      member: z.boolean().optional(),
      links: z.array(Link).optional(),
    }),
  ),
});

const Id = z.union([z.string(), z.number()]).transform(String);
const Named = z.object({ name: z.string() });
// Deere's samples serve a make or model both as an object and as a one-element array.
const NamedOrList = z
  .union([Named, z.array(Named)])
  .optional()
  .transform((value) => (Array.isArray(value) ? value[0] : value)?.name ?? null);
const EquipmentPage = z.object({
  links: z.array(Link).optional(),
  values: z.array(
    z.object({
      id: Id,
      principalId: z.number().int(),
      name: z.string(),
      serialNumber: z.string().nullish(),
      engineSerialNumber: z.string().nullish(),
      make: NamedOrList,
      model: NamedOrList,
      modelYear: z.union([z.string(), z.number()]).nullish(),
      // The owning organization comes first.
      organization: z.tuple([z.object({ id: Id })], z.object({ id: Id })),
      telematicsCapable: z.boolean().optional(),
      archived: z.boolean().optional(),
      devices: z.array(z.object({ '@type': z.string().optional() })).optional(),
    }),
  ),
});

const EngineHoursPage = z.object({
  values: z.array(
    z.object({
      reading: z.object({ valueAsDouble: z.number() }),
      reportTime: z.iso.datetime(),
      source: z.string(),
    }),
  ),
});

const linkTo = (links: readonly z.infer<typeof Link>[] | undefined, rel: string) =>
  links?.find((link) => link.rel === rel)?.uri ?? null;

/** A thin fetch client over the parts of Operations Center the John Deere Connection uses. */
export class JohnDeereClient {
  constructor(private readonly config: JohnDeereClientConfig) {}

  authorizeUrl({ scopes, state, redirectUri }: { scopes: string; state: string; redirectUri: string }): string {
    const url = new URL(`${this.config.issuer}/v1/authorize`);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
    }).toString();
    return url.toString();
  }

  exchangeCode({ code, redirectUri }: { code: string; redirectUri: string }): Promise<JohnDeereTokens> {
    return this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  }

  refresh({
    refreshToken,
    redirectUri,
    scopes,
  }: {
    refreshToken: string;
    redirectUri: string;
    scopes: string;
  }): Promise<JohnDeereTokens> {
    return this.token({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      redirect_uri: redirectUri,
      scope: scopes,
    });
  }

  async organizations(accessToken: string): Promise<JohnDeereOrganizationListing[]> {
    const listings: JohnDeereOrganizationListing[] = [];
    let next: string | null = `${this.config.platformBaseUrl}/organizations?showLinks=connections,manage_connections`;
    while (next) {
      const page = OrganizationsPage.safeParse(await this.getJson(next, accessToken, AXIOM_JSON));
      if (!page.success) throw badResponse('John Deere sent an organization list Jedidiah cannot read.');
      for (const organization of page.data.values) {
        listings.push({
          id: organization.id,
          name: organization.name,
          type: organization.type ?? null,
          member: organization.member ?? false,
          connectionsUrl: linkTo(organization.links, 'connections'),
          manageConnectionsUrl: linkTo(organization.links, 'manage_connections'),
        });
      }
      next = linkTo(page.data.links, 'nextPage');
    }
    return listings;
  }

  /** Every connected, unarchived machine the connection can read, across every page. */
  equipment(accessToken: string): Promise<DeereMachine[]> {
    const query = 'categories=Machine&capableOf=Connectivity&archived=false&embed=devices&itemLimit=100';
    return this.equipmentPages(`${this.config.equipmentBaseUrl}/equipment?${query}`, accessToken);
  }

  /** The machines with these ids, archived or not; one the organization no longer lists is simply absent. */
  equipmentByIds(accessToken: string, ids: readonly string[]): Promise<DeereMachine[]> {
    const query = new URLSearchParams({ ids: ids.join(','), embed: 'devices', itemLimit: '100' });
    return this.equipmentPages(`${this.config.equipmentBaseUrl}/equipment?${query}`, accessToken);
  }

  /** The machine's last known engine hours, or null when it has reported none. */
  async engineHours(accessToken: string, principalId: number): Promise<DeereEngineHours | null> {
    const url = `${this.config.platformBaseUrl}/machines/${principalId}/engineHours?lastKnown=true&showLinks=none`;
    const page = EngineHoursPage.safeParse(await this.getJson(url, accessToken, AXIOM_JSON));
    if (!page.success) throw badResponse('John Deere sent engine hours Jedidiah cannot read.');
    const [last] = page.data.values;
    return last
      ? { hours: last.reading.valueAsDouble, reportTime: new Date(last.reportTime), source: last.source }
      : null;
  }

  /** Where to send the browser to grant an organization access, returning to `redirectUri` afterwards. */
  connectionsUrl(url: string, redirectUri: string): string {
    const target = new URL(url);
    target.searchParams.set('redirect_uri', redirectUri);
    return target.toString();
  }

  private async equipmentPages(first: string, accessToken: string): Promise<DeereMachine[]> {
    const machines: DeereMachine[] = [];
    let next: string | null = first;
    while (next) {
      const page = EquipmentPage.safeParse(await this.getJson(next, accessToken, 'application/json'));
      if (!page.success) throw badResponse('John Deere sent an equipment list Jedidiah cannot read.');
      for (const machine of page.data.values)
        machines.push({
          id: machine.id,
          principalId: machine.principalId,
          name: machine.name,
          serialNumber: machine.serialNumber ?? null,
          engineSerialNumber: machine.engineSerialNumber ?? null,
          make: machine.make,
          model: machine.model,
          modelYear: machine.modelYear == null ? null : String(machine.modelYear),
          organizationId: machine.organization[0].id,
          telematicsCapable: machine.telematicsCapable ?? false,
          archived: machine.archived ?? false,
          hasModem: machine.devices?.some((device) => device['@type'] === 'TelematicsGateway') ?? false,
        });
      next = linkTo(page.data.links, 'nextPage');
    }
    return machines;
  }

  private async token(grant: Record<string, string>): Promise<JohnDeereTokens> {
    const response = await this.config.fetch(`${this.config.issuer}/v1/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        ...grant,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }).toString(),
    });
    const body = await response.text();
    // A spent or revoked grant is the only refusal a Reconnect fixes; a wrong secret or redirect is not.
    if (response.status === 400 && TokenRefusal.safeParse(parseJsonOrNull(body)).success)
      throw new JohnDeereError('john_deere.unauthorized', 'John Deere refused the sign-in. Reconnect John Deere.');
    if (!response.ok) throw johnDeereResponseError(response, body);
    const tokens = TokenResponse.safeParse(parseJson(body));
    if (!tokens.success) throw badResponse('John Deere sent a token response Jedidiah cannot read.');
    return {
      accessToken: tokens.data.access_token,
      refreshToken: tokens.data.refresh_token,
      expiresAt: new Date(this.config.now().getTime() + tokens.data.expires_in * 1000),
    };
  }

  private async getJson(url: string, accessToken: string, accept: string): Promise<unknown> {
    const response = await this.config.fetch(url, {
      headers: { Accept: accept, 'Accept-Encoding': 'gzip', Authorization: `Bearer ${accessToken}` },
    });
    const body = await response.text();
    if (!response.ok) throw johnDeereResponseError(response, body);
    return parseJson(body);
  }
}

function parseJsonOrNull(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function parseJson(body: string): unknown {
  const parsed = parseJsonOrNull(body);
  if (parsed === null) throw badResponse('John Deere sent a response that is not JSON.');
  return parsed;
}
