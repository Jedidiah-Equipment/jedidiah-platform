import { randomBytes } from 'node:crypto';
import { defineAuditDescriptor, diffAuditUpdate, recordAuditCreate, recordAuditUpdate } from '@pkg/core';
import { type DatabaseTransaction, type Db, eq, user } from '@pkg/db';
import { contractingJohnDeereConnection, JOHN_DEERE_CONNECTION_ID } from '@pkg/db/contracting';
import { type AuthId, DateIso } from '@pkg/schema';
import type {
  JohnDeereConnectionState,
  JohnDeereConnectionStatus,
  JohnDeereConnectionView,
} from '@pkg/schema/contracting';
import type { JohnDeereClient, JohnDeereOrganizationListing, JohnDeereTokens } from './client.js';
import { invalidState, isJohnDeereError, notConnected } from './john-deere-errors.js';
import { decryptSecret, encryptSecret } from './token-vault.js';

type ConnectionRow = typeof contractingJohnDeereConnection.$inferSelect;
type ConnectionPatch = Partial<Omit<typeof contractingJohnDeereConnection.$inferInsert, 'id'>>;

/** What the connection card reads; the API adds whether the environment is configured at all. */
export type JohnDeereConnection = Omit<JohnDeereConnectionView, 'configured'>;

export const NOT_CONNECTED: JohnDeereConnection = {
  status: 'not-connected',
  organizations: [],
  connectedBy: null,
  connectedAt: null,
  lastPolledAt: null,
  lastError: null,
};

// A round trip still open reads as Not connected: nothing is connected until Deere answers.
const servedState: Record<JohnDeereConnectionStatus, JohnDeereConnectionState> = {
  'not-connected': 'not-connected',
  pending: 'not-connected',
  connected: 'connected',
  'needs-reconnect': 'needs-reconnect',
};

export type JohnDeereConnectionServiceConfig = {
  db: Db;
  client: JohnDeereClient;
  /** The 32-byte key the refresh token is encrypted with. */
  tokenKey: Uint8Array;
  /** The API's OAuth callback; Deere matches every grant against it. */
  redirectUri: string;
  /** Where Deere's organization picker sends the browser back to: the callback's second leg. */
  connectionsReturnUri: string;
  now: () => Date;
  /** Waits before the one re-read of the organization list; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
};

export const JOHN_DEERE_SCOPES = 'eq1 offline_access';
const STATE_LIFETIME_MS = 10 * 60 * 1000;
// Refresh this long before Deere's expiry, so a token never lapses mid-poll.
const ACCESS_TOKEN_MARGIN_MS = 5 * 60 * 1000;
// Deere's organization list can lag the picker by a moment; one re-read after this covers it.
const ORGANIZATION_REREAD_DELAY_MS = 2_000;
const NO_ORGANIZATION_CONNECTED =
  'No John Deere organization has given Jedidiah access. Reconnect and choose the organization.';

/** The refusal with what Deere listed, so the tab shows the evidence: each organization and its link names. */
const noOrganizationConnected = (listings: readonly JohnDeereOrganizationListing[]) =>
  listings.length === 0
    ? `${NO_ORGANIZATION_CONNECTED} John Deere listed no organizations for that sign-in.`
    : `${NO_ORGANIZATION_CONNECTED} John Deere listed: ${listings
        .map((listing) => `${listing.name} (${listing.linkRels.length ? listing.linkRels.join(', ') : 'no links'})`)
        .join('; ')}.`;

// The token columns and the OAuth round trip are credentials and never reach the audit log; the poll and
// refresh timestamps move every hour and are not audited facts.
const descriptor = defineAuditDescriptor<ConnectionRow>({
  entityType: 'contracting_john_deere_connection',
  noun: 'John Deere Connection',
  primaryLabelField: 'label',
  entityId: () => JOHN_DEERE_CONNECTION_ID,
  label: () => 'John Deere Connection',
  toRecord: ({ status, scopes, organizations, connectedByUserId, connectedAt, lastError }) => ({
    status,
    scopes,
    organizations: organizations.map((organization) => organization.name),
    connectedByUserId,
    connectedAt,
    lastError,
  }),
});

const connectedOrganizations = (listings: readonly JohnDeereOrganizationListing[]) =>
  listings
    .filter((listing) => listing.manageConnectionsUrl !== null)
    .map((listing) => ({ id: listing.id, name: listing.name }));

/**
 * Contracting's one John Deere Connection: the OAuth round trip that makes it, the encrypted refresh token
 * that keeps it, and the access token every Deere call borrows.
 */
export class JohnDeereConnectionService {
  private cachedAccessToken: { token: string; expiresAt: Date } | null = null;
  private refreshing: Promise<string> | null = null;

  constructor(private readonly config: JohnDeereConnectionServiceConfig) {}

  async getConnection(): Promise<JohnDeereConnection> {
    const [row] = await this.config.db
      .select({ connection: contractingJohnDeereConnection, connectedByName: user.name })
      .from(contractingJohnDeereConnection)
      .leftJoin(user, eq(user.id, contractingJohnDeereConnection.connectedByUserId))
      .where(eq(contractingJohnDeereConnection.id, JOHN_DEERE_CONNECTION_ID));
    if (!row) return NOT_CONNECTED;
    const { connection, connectedByName } = row;
    return {
      status: servedState[connection.status],
      organizations: connection.organizations,
      connectedBy:
        connection.connectedByUserId && connectedByName !== null
          ? { id: connection.connectedByUserId, name: connectedByName }
          : null,
      connectedAt: connection.connectedAt ? DateIso.parse(connection.connectedAt) : null,
      lastPolledAt: connection.lastPolledAt ? DateIso.parse(connection.lastPolledAt) : null,
      lastError: connection.lastError,
    };
  }

  /**
   * Opens a round trip and returns where to send the browser. A connection that already holds a token keeps
   * its status, token and Connected by: a Reconnect changes nothing until Deere answers.
   */
  async startConnect({ actorUserId }: { actorUserId: AuthId }): Promise<{ url: string }> {
    const state = `connect:${randomBytes(16).toString('hex')}`;
    await this.write({
      actorUserId,
      create: true,
      set: (before) => ({
        status: before?.refreshTokenCiphertext ? before.status : 'pending',
        pendingState: state,
        pendingStateExpiresAt: this.stateExpiry(),
        pendingByUserId: actorUserId,
        pendingRefreshTokenCiphertext: null,
      }),
    });
    return {
      url: this.config.client.authorizeUrl({ scopes: JOHN_DEERE_SCOPES, state, redirectUri: this.config.redirectUri }),
    };
  }

  /**
   * The callback's first leg. When no organization has granted access yet, the round trip stays open under a
   * fresh `returnToken` and the caller sends the browser to `picker.url`; Deere's picker returns with no
   * `state`, so the caller hands the token to the browser alone and {@link finishConnect} demands it back.
   */
  async completeConnect({ code, state }: { code: string; state: string }): Promise<{
    connected: boolean;
    picker: { url: string; returnToken: string } | null;
  }> {
    const opened = await this.openRoundTrip(state);
    const tokens = await this.config.client.exchangeCode({ code, redirectUri: this.config.redirectUri });
    const listings = await this.readOrganizations(tokens.accessToken, { reread: 'without-any-link' });
    const organizations = connectedOrganizations(listings);
    const pickerUrl =
      organizations.length === 0 ? (listings.find((listing) => listing.connectionsUrl)?.connectionsUrl ?? null) : null;
    if (!pickerUrl) return { connected: await this.settle(state, opened, listings, tokens), picker: null };

    // The new sign-in waits beside the current one, so an abandoned picker leaves a working connection intact.
    const returnToken = `return:${randomBytes(16).toString('hex')}`;
    await this.writeRoundTrip(state, opened.pendingByUserId, () => ({
      pendingState: returnToken,
      pendingStateExpiresAt: this.stateExpiry(),
      pendingRefreshTokenCiphertext: encryptSecret(tokens.refreshToken, this.config.tokenKey),
    }));
    return {
      connected: false,
      picker: { url: this.config.client.connectionsUrl(pickerUrl, this.config.connectionsReturnUri), returnToken },
    };
  }

  /** The callback's second leg, after Deere's organization picker, admitted by the first leg's `returnToken`. */
  async finishConnect({ returnToken }: { returnToken: string }): Promise<{ connected: boolean }> {
    const opened = await this.openRoundTrip(returnToken);
    if (!opened.pendingRefreshTokenCiphertext) throw invalidState();
    const tokens = await this.config.client.refresh({
      refreshToken: decryptSecret(opened.pendingRefreshTokenCiphertext, this.config.tokenKey),
      redirectUri: this.config.redirectUri,
      scopes: JOHN_DEERE_SCOPES,
    });
    const listings = await this.readOrganizations(tokens.accessToken, { reread: 'without-a-connected-one' });
    return { connected: await this.settle(returnToken, opened, listings, tokens) };
  }

  /** Forgets the tokens and the organizations; the feed stops until someone connects again. */
  async disconnect({ actorUserId }: { actorUserId: AuthId }): Promise<void> {
    this.cachedAccessToken = null;
    await this.write({
      actorUserId,
      set: () => ({
        status: 'not-connected',
        pendingState: null,
        pendingStateExpiresAt: null,
        pendingByUserId: null,
        pendingRefreshTokenCiphertext: null,
        refreshTokenCiphertext: null,
        scopes: null,
        organizations: [],
        connectedByUserId: null,
        connectedAt: null,
        lastRefreshedAt: null,
        lastError: null,
        lastErrorAt: null,
      }),
    });
  }

  /**
   * A current access token, refreshed under one in-flight refresh at a time. A refused refresh means the
   * owner's grant is gone: the connection becomes Needs reconnecting and the error is rethrown.
   */
  async accessToken(): Promise<string> {
    const cached = this.cachedAccessToken;
    if (cached && cached.expiresAt.getTime() - ACCESS_TOKEN_MARGIN_MS > this.config.now().getTime())
      return cached.token;
    this.refreshing ??= this.refreshAccessToken().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** A new access token for one Deere refused, such as a token the owner revoked before its 12 hours ran out. */
  renewAccessToken(): Promise<string> {
    this.cachedAccessToken = null;
    return this.accessToken();
  }

  async markError({ message }: { message: string }): Promise<void> {
    await this.write({ actorUserId: null, set: () => ({ lastError: message, lastErrorAt: this.config.now() }) });
  }

  async markPolled(): Promise<void> {
    await this.write({
      actorUserId: null,
      set: () => ({ lastPolledAt: this.config.now(), lastError: null, lastErrorAt: null }),
    });
  }

  private async refreshAccessToken(): Promise<string> {
    const [row] = await selectRow(this.config.db);
    if (!row?.refreshTokenCiphertext || row.status !== 'connected') throw notConnected();
    const refreshed = row.refreshTokenCiphertext;
    // Applies only to the grant that was refreshed: a Disconnect or Reconnect that landed meanwhile wins.
    const stillCurrent = (before: ConnectionRow | null) =>
      before?.status === 'connected' && before.refreshTokenCiphertext === refreshed;

    try {
      const tokens = await this.config.client.refresh({
        refreshToken: decryptSecret(refreshed, this.config.tokenKey),
        redirectUri: this.config.redirectUri,
        scopes: row.scopes ?? JOHN_DEERE_SCOPES,
      });
      const applied = await this.write({
        actorUserId: null,
        set: (before) =>
          stillCurrent(before)
            ? {
                refreshTokenCiphertext: encryptSecret(tokens.refreshToken, this.config.tokenKey),
                lastRefreshedAt: this.config.now(),
              }
            : null,
      });
      if (!applied) throw notConnected();
      this.cachedAccessToken = { token: tokens.accessToken, expiresAt: tokens.expiresAt };
      return tokens.accessToken;
    } catch (error) {
      if (isJohnDeereError(error) && error.code === 'john_deere.unauthorized') {
        this.cachedAccessToken = null;
        await this.write({
          actorUserId: null,
          set: (before) =>
            stillCurrent(before)
              ? { status: 'needs-reconnect', lastError: error.message, lastErrorAt: this.config.now() }
              : null,
        });
      }
      throw error;
    }
  }

  /** The round trip `credential` opened, or a refusal when it is not the open one or has expired. */
  private async openRoundTrip(credential: string): Promise<ConnectionRow> {
    const [row] = await selectRow(this.config.db);
    if (!row || !this.isOpenRoundTrip(row, credential)) throw invalidState();
    return row;
  }

  private isOpenRoundTrip(row: ConnectionRow | null, credential: string): row is ConnectionRow {
    return Boolean(
      row?.pendingState === credential && row.pendingStateExpiresAt && row.pendingStateExpiresAt > this.config.now(),
    );
  }

  /** A write the round trip `credential` still owns under the row lock; a newer Connect or a Disconnect wins. */
  private async writeRoundTrip(
    credential: string,
    actorUserId: string | null,
    set: (before: ConnectionRow) => ConnectionPatch,
  ): Promise<void> {
    const applied = await this.write({
      actorUserId,
      set: (before) => (this.isOpenRoundTrip(before, credential) ? set(before) : null),
    });
    if (!applied) throw invalidState();
  }

  /**
   * Closes the round trip. With an organization that granted access the new sign-in becomes the connection,
   * credited to whoever opened the round trip. Without one, a working connection stays exactly as it was and
   * any other is left Not connected or Needs reconnecting, saying why.
   */
  private async settle(
    credential: string,
    opened: ConnectionRow,
    listings: readonly JohnDeereOrganizationListing[],
    tokens: JohnDeereTokens,
  ): Promise<boolean> {
    const organizations = connectedOrganizations(listings);
    const now = this.config.now();
    const closed = {
      pendingState: null,
      pendingStateExpiresAt: null,
      pendingByUserId: null,
      pendingRefreshTokenCiphertext: null,
    };
    const connected = organizations.length > 0;
    await this.writeRoundTrip(credential, opened.pendingByUserId, (before): ConnectionPatch => {
      if (connected)
        return {
          ...closed,
          status: 'connected',
          refreshTokenCiphertext: encryptSecret(tokens.refreshToken, this.config.tokenKey),
          scopes: JOHN_DEERE_SCOPES,
          lastRefreshedAt: now,
          organizations,
          connectedByUserId: opened.pendingByUserId,
          connectedAt: now,
          lastError: null,
          lastErrorAt: null,
        };
      if (before.status === 'connected') return closed;
      return {
        ...closed,
        status: before.status === 'pending' ? 'not-connected' : before.status,
        lastError: noOrganizationConnected(listings),
        lastErrorAt: now,
      };
    });
    if (connected) this.cachedAccessToken = { token: tokens.accessToken, expiresAt: tokens.expiresAt };
    return connected;
  }

  /**
   * The organization list, read once more after a pause when the first read has nothing to act on: after the
   * picker, no connected organization; on the code leg, no link to act on at all. A picker-bound first leg
   * never waits.
   */
  private async readOrganizations(
    accessToken: string,
    { reread }: { reread: 'without-a-connected-one' | 'without-any-link' },
  ): Promise<JohnDeereOrganizationListing[]> {
    const listings = await this.config.client.organizations(accessToken);
    const actionable =
      reread === 'without-a-connected-one'
        ? connectedOrganizations(listings).length > 0
        : listings.some((listing) => listing.manageConnectionsUrl || listing.connectionsUrl);
    if (actionable) return listings;
    await (this.config.sleep ?? sleepFor)(ORGANIZATION_REREAD_DELAY_MS);
    return this.config.client.organizations(accessToken);
  }

  private stateExpiry(): Date {
    return new Date(this.config.now().getTime() + STATE_LIFETIME_MS);
  }

  /**
   * Every write to the row, audited. Hand-rolled rather than `mutateEntity` because the token and timestamp
   * columns must be written even when no audited field changes, and because the row is created on first use.
   * A write to an absent row, or one whose `set` returns null, is skipped; the result says whether it applied.
   */
  private async write({
    actorUserId,
    create = false,
    set,
  }: {
    actorUserId: string | null;
    create?: boolean;
    set: (before: ConnectionRow | null) => ConnectionPatch | null;
  }): Promise<boolean> {
    return this.config.db.transaction(async (tx) => {
      const initial = create ? set(null) : null;
      if (initial) {
        const [created] = await tx
          .insert(contractingJohnDeereConnection)
          .values({ ...initial, id: JOHN_DEERE_CONNECTION_ID, updatedAt: this.config.now() })
          .onConflictDoNothing()
          .returning();
        if (created) {
          await recordAuditCreate({ db: tx, descriptor, actorUserId, input: created });
          return true;
        }
      }
      const [before] = await selectRow(tx).for('update');
      const patch = before ? set(before) : null;
      if (!before || !patch) return false;
      await this.update(tx, actorUserId, before, patch);
      return true;
    });
  }

  private async update(
    tx: DatabaseTransaction,
    actorUserId: string | null,
    before: ConnectionRow,
    patch: ConnectionPatch,
  ): Promise<void> {
    const [row] = await tx
      .update(contractingJohnDeereConnection)
      .set({ ...patch, updatedAt: this.config.now() })
      .where(eq(contractingJohnDeereConnection.id, JOHN_DEERE_CONNECTION_ID))
      .returning();
    if (!row) throw new Error('The John Deere Connection vanished under its row lock.');
    const changes = diffAuditUpdate(descriptor, before, row);
    if (changes) await recordAuditUpdate({ db: tx, descriptor, actorUserId, after: row, changes });
  }
}

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const selectRow = (db: Db | DatabaseTransaction) =>
  db
    .select()
    .from(contractingJohnDeereConnection)
    .where(eq(contractingJohnDeereConnection.id, JOHN_DEERE_CONNECTION_ID));
