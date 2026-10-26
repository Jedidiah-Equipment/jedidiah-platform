import { z } from 'zod';
import { badResponse, JohnDeereError, johnDeereResponseError } from './john-deere-errors.js';

export type JohnDeereClientConfig = {
  /** The Operations Center platform API, `…/platform`; the sandbox until Deere validates the application. */
  platformBaseUrl: string;
  /** The Equipment API, `…/isg`; read from #1821 on. */
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

const AXIOM_JSON = 'application/vnd.deere.axiom.v3+json';

const TokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive(),
});

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

  /** Where to send the browser to grant an organization access, returning to `redirectUri` afterwards. */
  connectionsUrl(url: string, redirectUri: string): string {
    const target = new URL(url);
    target.searchParams.set('redirect_uri', redirectUri);
    return target.toString();
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
    // A spent or revoked grant answers 400 `invalid_grant`: the sign-in is gone, so it reads as a refused one.
    if (response.status === 400)
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

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw badResponse('John Deere sent a response that is not JSON.');
  }
}
