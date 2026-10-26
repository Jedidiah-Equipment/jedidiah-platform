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
import type { JohnDeereClient, JohnDeereOrganizationListing } from './client.js';
import { invalidState, isJohnDeereError, notConnected } from './john-deere-errors.js';
import { decryptSecret, encryptSecret } from './token-vault.js';

type ConnectionRow = typeof contractingJohnDeereConnection.$inferSelect;
type ConnectionPatch = Partial<Omit<typeof contractingJohnDeereConnection.$inferInsert, 'id'>>;
type SettledPatch = ConnectionPatch & { status: JohnDeereConnectionStatus };

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
};

export const JOHN_DEERE_SCOPES = 'eq1 offline_access';
const STATE_LIFETIME_MS = 10 * 60 * 1000;
// Refresh this long before Deere's expiry, so a token never lapses mid-poll.
const ACCESS_TOKEN_MARGIN_MS = 5 * 60 * 1000;
const NO_ORGANIZATION_CONNECTED =
  'No John Deere organization has given Jedidiah access. Reconnect and choose the organization.';

// The token columns and the OAuth state are credentials and never reach the audit log; the poll and
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
   * its status and its Connected by, so a Reconnect changes nothing until Deere answers.
   */
  async startConnect({ actorUserId }: { actorUserId: AuthId }): Promise<{ url: string }> {
    const state = `connect:${randomBytes(16).toString('hex')}`;
    await this.write({
      actorUserId,
      create: true,
      set: (before) => ({
        status: before?.refreshTokenCiphertext ? before.status : 'pending',
        pendingState: state,
        pendingStateExpiresAt: new Date(this.config.now().getTime() + STATE_LIFETIME_MS),
        pendingByUserId: actorUserId,
      }),
    });
    return {
      url: this.config.client.authorizeUrl({
        scopes: JOHN_DEERE_SCOPES,
        state,
        redirectUri: this.config.redirectUri,
      }),
    };
  }

  /**
   * The callback's first leg. When no organization has granted access yet, the round trip stays open and
   * the caller sends the browser to the returned `connectionsUrl`, then calls {@link finishConnect}.
   */
  async completeConnect({
    code,
    state,
  }: {
    code: string;
    state: string;
  }): Promise<{ status: JohnDeereConnectionStatus; connectionsUrl: string | null }> {
    const opened = await this.openRoundTrip();
    if (opened.pendingState !== state) throw invalidState();

    const tokens = await this.config.client.exchangeCode({ code, redirectUri: this.config.redirectUri });
    this.cachedAccessToken = { token: tokens.accessToken, expiresAt: tokens.expiresAt };
    const listings = await this.config.client.organizations(tokens.accessToken);
    const organizations = connectedOrganizations(listings);
    const connectionsUrl =
      organizations.length === 0 ? (listings.find((listing) => listing.connectionsUrl)?.connectionsUrl ?? null) : null;
    const now = this.config.now();
    // Still waiting on the organization picker: a Connected row stays Connected until it settles.
    const outcome: SettledPatch = connectionsUrl
      ? {
          status: opened.status === 'connected' ? 'connected' : 'pending',
          pendingStateExpiresAt: new Date(now.getTime() + STATE_LIFETIME_MS),
        }
      : this.settled(organizations, opened.pendingByUserId, now);

    await this.write({
      actorUserId: opened.pendingByUserId,
      set: () => ({
        refreshTokenCiphertext: encryptSecret(tokens.refreshToken, this.config.tokenKey),
        scopes: JOHN_DEERE_SCOPES,
        lastRefreshedAt: now,
        ...outcome,
      }),
    });
    return {
      status: outcome.status,
      connectionsUrl:
        connectionsUrl && this.config.client.connectionsUrl(connectionsUrl, this.config.connectionsReturnUri),
    };
  }

  /**
   * The callback's second leg, after Deere's organization picker. Deere returns no `state` here, so the
   * round trip {@link completeConnect} left open is what admits it.
   */
  async finishConnect(): Promise<{ status: JohnDeereConnectionStatus }> {
    const opened = await this.openRoundTrip();
    const organizations = connectedOrganizations(await this.config.client.organizations(await this.accessToken()));
    const outcome = this.settled(organizations, opened.pendingByUserId, this.config.now());
    await this.write({ actorUserId: opened.pendingByUserId, set: () => outcome });
    return { status: outcome.status };
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
    if (!row?.refreshTokenCiphertext || row.status === 'needs-reconnect') throw notConnected();

    try {
      const tokens = await this.config.client.refresh({
        refreshToken: decryptSecret(row.refreshTokenCiphertext, this.config.tokenKey),
        redirectUri: this.config.redirectUri,
        scopes: row.scopes ?? JOHN_DEERE_SCOPES,
      });
      this.cachedAccessToken = { token: tokens.accessToken, expiresAt: tokens.expiresAt };
      await this.write({
        actorUserId: null,
        set: () => ({
          refreshTokenCiphertext: encryptSecret(tokens.refreshToken, this.config.tokenKey),
          lastRefreshedAt: this.config.now(),
        }),
      });
      return tokens.accessToken;
    } catch (error) {
      if (isJohnDeereError(error) && error.code === 'john_deere.unauthorized') {
        this.cachedAccessToken = null;
        await this.write({
          actorUserId: null,
          set: () => ({ status: 'needs-reconnect', lastError: error.message, lastErrorAt: this.config.now() }),
        });
      }
      throw error;
    }
  }

  /** The open round trip, or a refusal when there is none or it has expired. */
  private async openRoundTrip(): Promise<ConnectionRow> {
    const [row] = await selectRow(this.config.db);
    if (!row?.pendingState || !row.pendingStateExpiresAt || row.pendingStateExpiresAt <= this.config.now())
      throw invalidState();
    return row;
  }

  /**
   * Closes the round trip: Connected, by whoever opened it, with the organizations that granted access; else
   * Needs reconnecting, keeping the sign-in so a Reconnect can pick the organization.
   */
  private settled(
    organizations: ConnectionRow['organizations'],
    connectedByUserId: string | null,
    now: Date,
  ): SettledPatch {
    const closed = { pendingState: null, pendingStateExpiresAt: null, pendingByUserId: null, organizations };
    return organizations.length > 0
      ? { ...closed, status: 'connected', connectedByUserId, connectedAt: now, lastError: null, lastErrorAt: null }
      : { ...closed, status: 'needs-reconnect', lastError: NO_ORGANIZATION_CONNECTED, lastErrorAt: now };
  }

  /**
   * Every write to the row, audited. Hand-rolled rather than `mutateEntity` because the token and timestamp
   * columns must be written even when no audited field changes, and because the row is created on first use.
   * A write to an absent row is a no-op unless `create` is set.
   */
  private async write({
    actorUserId,
    create = false,
    set,
  }: {
    actorUserId: string | null;
    create?: boolean;
    set: (before: ConnectionRow | null) => ConnectionPatch;
  }): Promise<void> {
    await this.config.db.transaction(async (tx) => {
      if (create) {
        const [created] = await tx
          .insert(contractingJohnDeereConnection)
          .values({ ...set(null), id: JOHN_DEERE_CONNECTION_ID, updatedAt: this.config.now() })
          .onConflictDoNothing()
          .returning();
        if (created) return recordAuditCreate({ db: tx, descriptor, actorUserId, input: created });
      }
      const [before] = await selectRow(tx).for('update');
      if (before) await this.update(tx, actorUserId, before, set(before));
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

const selectRow = (db: Db | DatabaseTransaction) =>
  db
    .select()
    .from(contractingJohnDeereConnection)
    .where(eq(contractingJohnDeereConnection.id, JOHN_DEERE_CONNECTION_ID));
